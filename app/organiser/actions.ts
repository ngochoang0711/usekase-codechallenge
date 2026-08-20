'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { zonedTimeToUtc } from '../../lib/domain/time';
import { createShow, updateShow, type ShowInput } from '../../lib/db/shows';
import { listOrganiserVenues, type OrganiserVenue } from '../../lib/db/venues';
import { getOrganiserId } from '../../lib/session';

// Zod's built-in .uuid() enforces RFC 4122's version/variant nibbles,
// which db/seed.sql's deliberately-readable placeholder ids (e.g.
// "0b000000-0000-0000-0000-000000000001") don't satisfy -- real UUIDs
// from gen_random_uuid() in production would pass either way, so this
// only relaxes the shape check, not what's actually a valid venue (the
// venueId is still cross-checked against the caller's own venues below).
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const showFormSchema = z.object({
  venueId: z.string().regex(UUID_SHAPE, 'invalid venue id'),
  title: z.string().min(1),
  blurb: z.string().optional(),
  // "YYYY-MM-DDTHH:mm" from <input type="datetime-local"> -- the organiser
  // is describing a wall-clock time *at their venue*, so this is resolved
  // through the venue's own timezone below, never treated as UTC.
  startsAtLocal: z.string().min(1),
  durationMins: z.coerce.number().int().positive(),
  capacity: z.coerce.number().int().min(0),
  basePriceMinor: z.coerce.number().int().min(0),
  currency: z.string().min(3).max(3),
  status: z.enum(['draft', 'on_sale', 'cancelled']),
});

function parseShowForm(formData: FormData, venues: OrganiserVenue[]): ShowInput {
  const parsed = showFormSchema.parse(Object.fromEntries(formData.entries()));
  const venue = venues.find((v) => v.id === parsed.venueId);
  if (!venue) throw new Error('unknown venue, or not yours');

  const [datePart, timePart] = parsed.startsAtLocal.split('T');
  const [year, month, day] = (datePart ?? '').split('-').map(Number);
  const [hour, minute] = (timePart ?? '').split(':').map(Number);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error(`invalid startsAtLocal: "${parsed.startsAtLocal}"`);
  }

  return {
    venueId: parsed.venueId,
    title: parsed.title,
    blurb: parsed.blurb?.trim() ? parsed.blurb.trim() : null,
    startsAt: zonedTimeToUtc({ year, month, day, hour, minute }, venue.timezone),
    durationMins: parsed.durationMins,
    capacity: parsed.capacity,
    basePriceMinor: parsed.basePriceMinor,
    currency: parsed.currency.toUpperCase(),
    status: parsed.status,
  };
}

async function requireOrganiserId(): Promise<string> {
  const organiserId = await getOrganiserId();
  if (!organiserId) redirect('/organiser/login');
  return organiserId;
}

export async function createShowAction(formData: FormData): Promise<void> {
  const organiserId = await requireOrganiserId();
  const venues = await listOrganiserVenues(organiserId);
  const input = parseShowForm(formData, venues);
  await createShow(organiserId, input);
  revalidatePath('/organiser');
  redirect('/organiser');
}

export async function updateShowAction(showId: string, formData: FormData): Promise<void> {
  const organiserId = await requireOrganiserId();
  const venues = await listOrganiserVenues(organiserId);
  const input = parseShowForm(formData, venues);
  const result = await updateShow(organiserId, showId, input);
  if (!result) throw new Error('show not found, or not yours');
  revalidatePath('/organiser');
  redirect('/organiser');
}
