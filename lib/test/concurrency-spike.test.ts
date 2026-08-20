import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Smoke test for the DB engine decision itself: prove that `embedded-postgres`
// gives genuinely independent, overlapping connections where a
// `SELECT ... FOR UPDATE` row lock actually serializes concurrent writers.
// This is *not* testing Fringe's real schema -- that comes next. If this
// test ever goes red, that's a signal the whole oversell-prevention design
// needs re-examining, not a signal to loosen the assertion.
describe('embedded-postgres concurrency smoke test', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await pool.query(`
      create table spike_show (id int primary key, capacity int not null);
      create table spike_booking (id serial primary key, show_id int not null, qty int not null);
      insert into spike_show values (1, 4);
    `);
  });

  afterAll(async () => {
    await pool.query('drop table spike_booking; drop table spike_show;');
    await pool.end();
  });

  async function tryBook(qty: number): Promise<'confirmed' | 'rejected'> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{ capacity: number }>(
        'select capacity from spike_show where id = 1 for update',
      );
      const capacity = rows[0]?.capacity ?? 0;
      const { rows: sumRows } = await client.query<{ total: number }>(
        'select coalesce(sum(qty), 0)::int as total from spike_booking where show_id = 1',
      );
      const committed = sumRows[0]?.total ?? 0;
      // Widen the race window while holding the lock, so a broken lock would
      // show up as an overlap rather than getting lucky on timing.
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (committed + qty > capacity) {
        await client.query('rollback');
        return 'rejected';
      }
      await client.query('insert into spike_booking (show_id, qty) values (1, $1)', [qty]);
      await client.query('commit');
      return 'confirmed';
    } finally {
      client.release();
    }
  }

  it('serializes concurrent row-locked writers so capacity is never exceeded', async () => {
    const results = await Promise.all([tryBook(2), tryBook(2), tryBook(2), tryBook(2)]);

    expect(results.filter((r) => r === 'confirmed')).toHaveLength(2);
    expect(results.filter((r) => r === 'rejected')).toHaveLength(2);

    const { rows } = await pool.query<{ total: string }>(
      'select coalesce(sum(qty), 0) as total from spike_booking',
    );
    expect(Number(rows[0]?.total)).toBe(4);
  });
});
