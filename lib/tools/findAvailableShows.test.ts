import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema } from '../test/apply-schema';
import { closePool } from '../db/client';
import { findAvailableShows } from './findAvailableShows';

describe('findAvailableShows (FRG-130 concierge tool)', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await applySchema(pool, { seed: true });
  });

  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  it('rejects malformed input via Zod rather than reaching the database', async () => {
    await expect(findAvailableShows({ onDate: 'not-a-date' })).rejects.toThrow();
    await expect(findAvailableShows({ maxPriceMinor: -5 })).rejects.toThrow();
  });

  it('returns only genuinely bookable shows: no draft, cancelled, past, or zero-capacity shows', async () => {
    const { shows } = await findAvailableShows({});
    const titles = shows.map((s) => s.title);

    expect(titles).not.toContain('Draft Show, Do Not Show');
    expect(titles).not.toContain('Cancelled, Sadly');
    expect(titles).not.toContain("Yesterday's Matinee");
    expect(titles).not.toContain('Sold Out Before It Began'); // capacity 0
    expect(titles).toContain('Hungry Ghost Karaoke');
  });

  it('filters by city', async () => {
    const { shows } = await findAvailableShows({ city: 'Melbourne' });
    expect(shows.length).toBeGreaterThan(0);
    expect(shows.every((s) => s.venueCity === 'Melbourne')).toBe(true);
  });

  it('filters by max price, computed from the cheapest (under26) tier', async () => {
    const { shows } = await findAvailableShows({ maxPriceMinor: 0 });
    // Only the free show has an under26 price of exactly 0.
    expect(shows.map((s) => s.title)).toEqual(['Free Verse, Free Entry']);
  });

  it('filters by minimum seats available', async () => {
    const { shows } = await findAvailableShows({ minSeats: 1000 });
    expect(shows).toEqual([]);
  });

  it("resolves onDate through the venue's own timezone, not UTC (FRG-130 across a DST boundary)", async () => {
    // The 2am Monologue is 2026-10-04T15:30:00Z at a Melbourne venue, which
    // is 2026-10-05 02:30 *local* once the AEDT transition is accounted for
    // (see lib/domain/time.test.ts). "onDate: 2026-10-04" must NOT match it.
    const onTheUtcDate = await findAvailableShows({ onDate: '2026-10-04', city: 'Melbourne' });
    expect(onTheUtcDate.shows.map((s) => s.title)).not.toContain('The 2am Monologue');

    const onTheLocalDate = await findAvailableShows({ onDate: '2026-10-05', city: 'Melbourne' });
    expect(onTheLocalDate.shows.map((s) => s.title)).toContain('The 2am Monologue');
  });
});
