import { z } from 'zod';
import { computeAvailability } from '../domain/availability';
import { computeTierPriceMinor } from '../domain/money';
import { formatInVenueTimezone, localDateRangeUtc } from '../domain/time';
import { listShows } from '../db/shows';

export const findAvailableShowsInputSchema = z.object({
  city: z.string().min(1).optional(),
  /** A calendar date (YYYY-MM-DD) in the *venue's* local timezone -- see the comment on isOnDate below. */
  onDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected an ISO date like "2026-10-04"')
    .optional(),
  maxPriceMinor: z.number().int().nonnegative().optional(),
  minSeats: z.number().int().positive().optional(),
});

export type FindAvailableShowsInput = z.infer<typeof findAvailableShowsInputSchema>;

export interface AvailableShow {
  id: string;
  title: string;
  venueName: string;
  venueCity: string;
  /** Rendered in the venue's own local timezone -- never the caller's. */
  startsAtLocal: string;
  startsAtIso: string;
  /** The cheapest tier's price -- what the browse page's "price from" shows. */
  priceFromMinor: number;
  currency: string;
  seatsLeft: number;
}

export interface FindAvailableShowsOutput {
  shows: AvailableShow[];
}

function isOnRequestedDate(startsAt: Date, venueTimezone: string, onDate: string): boolean {
  const { start, end } = localDateRangeUtc(onDate, venueTimezone);
  const t = startsAt.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/**
 * `find_available_shows` -- the concierge bot's only tool. Deliberately
 * thin: city filtering and the public on-sale/future rows come from
 * listShows() (lib/db/shows.ts), the exact same query the browse page
 * runs; whether a show counts as available at all comes from
 * computeAvailability() (lib/domain/availability.ts), the exact same
 * function the browse page and the booking flow use. This function adds
 * nothing to the definition of "available" -- it only adds the
 * date/price/seat filters the tool's own input asks for.
 *
 * "onDate" is a calendar date in the *venue's* local timezone, not UTC and
 * not the caller's timezone: a festival spanning four timezones means
 * "shows on the 4th" has a different meaning in Melbourne than in
 * Kathmandu, and a show that starts a few hours either side of midnight
 * UTC needs to land on the date its own audience would call it. See
 * lib/domain/time.ts's localDateRangeUtc(), which resolves that date
 * through the venue's real IANA zone (DST included) rather than a fixed
 * offset.
 */
export async function findAvailableShows(rawInput: unknown): Promise<FindAvailableShowsOutput> {
  const input = findAvailableShowsInputSchema.parse(rawInput);

  const { shows } = await listShows({ page: 1, pageSize: 500, city: input.city });

  const results: AvailableShow[] = [];
  for (const show of shows) {
    const availability = computeAvailability(show.capacity, show.confirmedQty, show.liveHoldQty);
    if (availability.seatsLeft <= 0) continue;
    if (input.minSeats !== undefined && availability.seatsLeft < input.minSeats) continue;

    const priceFromMinor = computeTierPriceMinor(show.basePriceMinor, 'under26');
    if (input.maxPriceMinor !== undefined && priceFromMinor > input.maxPriceMinor) continue;

    if (input.onDate && !isOnRequestedDate(show.startsAt, show.venueTimezone, input.onDate)) continue;

    results.push({
      id: show.id,
      title: show.title,
      venueName: show.venueName,
      venueCity: show.venueCity,
      startsAtLocal: formatInVenueTimezone(show.startsAt, show.venueTimezone),
      startsAtIso: show.startsAt.toISOString(),
      priceFromMinor,
      currency: show.currency,
      seatsLeft: availability.seatsLeft,
    });
  }

  return { shows: results };
}
