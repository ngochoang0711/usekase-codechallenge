import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema } from '../test/apply-schema';
import { listOrganiserBookings } from './bookings';
import { closePool } from './client';
import { createShow, ForbiddenError, listOrganiserShows, updateShow } from './shows';

// The exact scenario docs/SETUP.md calls out: "Sign in as Mei ... If
// Darren's shows or bookings ever show up under Mei, that's the thing we
// want you to find rather than route around." These queries deliberately
// don't add their own organiser_id/venue_id filters -- db/policies.sql's
// RLS is what's being proven here, not application code discipline.
describe('organiser isolation (RLS, not app-level filtering)', () => {
  const MEI = '0a000000-0000-0000-0000-000000000001';
  const DARREN = '0a000000-0000-0000-0000-000000000002';
  const MEIS_VENUE = '0b000000-0000-0000-0000-000000000001'; // Black Box @ Bugis
  const DARRENS_VENUE = '0b000000-0000-0000-0000-000000000003'; // The Loft
  const LAST_FOUR_SEATS = '0c000000-0000-0000-0000-000000000003'; // Mei's
  const DRAFT_SHOW = '0c000000-0000-0000-0000-00000000000b'; // Darren's

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await applySchema(pool, { seed: true });
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  it("lists only the calling organiser's own shows, regardless of status", async () => {
    const meisShows = await listOrganiserShows(MEI);
    expect(meisShows.some((s) => s.id === LAST_FOUR_SEATS)).toBe(true);
    expect(meisShows.some((s) => s.id === DRAFT_SHOW)).toBe(false);

    const darrensShows = await listOrganiserShows(DARREN);
    expect(darrensShows.some((s) => s.id === DRAFT_SHOW)).toBe(true);
    expect(darrensShows.some((s) => s.id === LAST_FOUR_SEATS)).toBe(false);
  });

  it("lists only the calling organiser's own bookings -- every seeded booking belongs to Mei", async () => {
    expect((await listOrganiserBookings(MEI)).length).toBeGreaterThan(0);
    expect(await listOrganiserBookings(DARREN)).toEqual([]);
  });

  it('lets an organiser create a show under their own venue', async () => {
    const show = await createShow(MEI, {
      venueId: MEIS_VENUE,
      title: 'New Mei Show',
      blurb: null,
      startsAt: new Date(Date.now() + 86_400_000),
      durationMins: 60,
      capacity: 20,
      basePriceMinor: 2000,
      currency: 'SGD',
      status: 'draft',
    });
    expect(show.venueId).toBe(MEIS_VENUE);
  });

  it("blocks an organiser creating a show under someone else's venue, even though nothing filters it client-side", async () => {
    await expect(
      createShow(MEI, {
        venueId: DARRENS_VENUE,
        title: 'Sneaky Show',
        blurb: null,
        startsAt: new Date(Date.now() + 86_400_000),
        durationMins: 60,
        capacity: 20,
        basePriceMinor: 2000,
        currency: 'SGD',
        status: 'draft',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("hides another organiser's show from an update attempt (RLS, not a 403) -- updates zero rows, not someone else's", async () => {
    const result = await updateShow(MEI, DRAFT_SHOW, {
      venueId: DARRENS_VENUE,
      title: 'Hijacked',
      blurb: null,
      startsAt: new Date(Date.now() + 86_400_000),
      durationMins: 60,
      capacity: 20,
      basePriceMinor: 2000,
      currency: 'SGD',
      status: 'on_sale',
    });
    expect(result).toBeNull();

    // Confirm it's genuinely untouched, not silently mutated.
    const darrensShows = await listOrganiserShows(DARREN);
    const draft = darrensShows.find((s) => s.id === DRAFT_SHOW);
    expect(draft?.title).toBe('Draft Show, Do Not Show');
  });
});
