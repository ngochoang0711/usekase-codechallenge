import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema } from './apply-schema';

// Confirms schema.sql -> local-auth-shim.sql -> functions.sql -> policies.sql
// -> seed.sql actually execute against a real Postgres, and that
// create_hold/confirm_hold behave as designed. The integrity guard only
// pattern-matches the SQL text; this is the check that it actually runs.
describe('schema, functions and policies apply cleanly', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await applySchema(pool, { seed: true });
  });

  afterAll(async () => {
    await pool.end();
  });

  const LAST_FOUR_SEATS = '0c000000-0000-0000-0000-000000000003';

  it('rejects a hold that would push the show over capacity', async () => {
    // Last Four Seats: capacity 4, 2 confirmed + 1 live hold already
    // committed (see db/seed.sql) -> 1 seat left.
    await expect(
      pool.query('select * from create_hold($1, $2, $3, $4)', [
        LAST_FOUR_SEATS,
        2,
        'full',
        'sess-test',
      ]),
    ).rejects.toThrow(/sold out/);
  });

  it('accepts a hold within remaining capacity, then confirms it into a booking', async () => {
    const { rows } = await pool.query<{ id: string; quantity: number }>(
      'select * from create_hold($1, $2, $3, $4)',
      [LAST_FOUR_SEATS, 1, 'full', 'sess-test-2'],
    );
    expect(rows[0]?.quantity).toBe(1);

    const holdId = rows[0]?.id;
    const { rows: bookingRows } = await pool.query<{ grand_total: string }>(
      'select * from confirm_hold($1, $2, $3, $4)',
      [holdId, 'test@example.test', 4500, 270],
    );
    expect(bookingRows[0]?.grand_total).toBe('4770');

    // Show is now fully committed (2 confirmed + 1 live hold + this new
    // booking = 4 = capacity) -- any further hold must be rejected.
    await expect(
      pool.query('select * from create_hold($1, $2, $3, $4)', [
        LAST_FOUR_SEATS,
        1,
        'full',
        'sess-test-3',
      ]),
    ).rejects.toThrow(/sold out/);
  });

  it('enforces RLS: an organiser cannot read another organiser\'s shows', async () => {
    // SET ROLE and the request.jwt.claims GUC must both apply to the same
    // session, so this needs one dedicated connection, not pool.query()
    // (which can hand each call a different pooled connection).
    const client = await pool.connect();
    try {
      await client.query('set role authenticated');
      await client.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ organiser_id: '0a000000-0000-0000-0000-000000000001' }), // Mei
      ]);
      // Darren's venue is 0b...003/004 -> his draft/cancelled shows must be invisible to Mei.
      const { rows } = await client.query(
        "select * from show where id = '0c000000-0000-0000-0000-00000000000b'", // Draft Show, Do Not Show (Darren's venue)
      );
      expect(rows).toHaveLength(0);
    } finally {
      await client.query('reset role');
      client.release();
    }
  });
});
