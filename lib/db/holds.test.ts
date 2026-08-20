import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applySchema } from '../test/apply-schema';
import { closePool } from './client';
import {
  confirmHold,
  createHold,
  DuplicateHoldError,
  getHoldForSession,
  HoldExpiredError,
  HoldQuantityLimitError,
  SoldOutError,
} from './holds';

describe('holds and bookings (real concurrent connections, real Postgres)', () => {
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const venueId = '0b000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    await applySchema(adminPool);
    await adminPool.query(
      "insert into organiser (id, email, name) values ('0a000000-0000-0000-0000-000000000009', 'test@organiser.test', 'Test Organiser')",
    );
    await adminPool.query(
      `insert into venue (id, organiser_id, name, city, timezone) values
         ($1, '0a000000-0000-0000-0000-000000000009', 'Test Venue', 'Singapore', 'Asia/Singapore')`,
      [venueId],
    );
  });

  afterAll(async () => {
    await adminPool.end();
    await closePool();
  });

  async function insertShow(capacity: number): Promise<string> {
    const id = randomUUID();
    await adminPool.query(
      `insert into show (id, venue_id, title, starts_at, duration_mins, capacity, base_price, status)
       values ($1, $2, 'Concurrency Test Show', now() + interval '1 day', 60, $3, 1000, 'on_sale')`,
      [id, venueId, capacity],
    );
    return id;
  }

  it('serializes concurrent create_hold calls so a show can never be oversold', async () => {
    const showId = await insertShow(4);

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        createHold({ showId, quantity: 2, tier: 'full', sessionRef: `sess-${i}` }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(2);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(SoldOutError);
    }

    const { rows } = await adminPool.query<{ total: string }>(
      'select coalesce(sum(quantity), 0) as total from hold where show_id = $1 and released_at is null and expires_at > now()',
      [showId],
    );
    expect(Number(rows[0]?.total)).toBe(4);
  });

  it('holds up under a higher-contention race: 10 concurrent requests, capacity for 3', async () => {
    const showId = await insertShow(3);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createHold({ showId, quantity: 1, tier: 'full', sessionRef: `sess-r-${i}` }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(7);
  });

  it('confirms a hold into a booking with the correct totals, then blocks further holds once full', async () => {
    const showId = await insertShow(2);

    const hold = await createHold({ showId, quantity: 2, tier: 'full', sessionRef: 'sess-confirm' });
    const booking = await confirmHold({
      holdId: hold.id,
      buyerEmail: 'buyer@example.test',
      lineTotalMinor: 2000,
      bookingFeeMinor: 120,
    });

    expect(booking.grandTotalMinor).toBe(2120);
    expect(booking.quantity).toBe(2);

    await expect(
      createHold({ showId, quantity: 1, tier: 'full', sessionRef: 'sess-late' }),
    ).rejects.toBeInstanceOf(SoldOutError);
  });

  it('rejects confirming a hold that has already expired', async () => {
    const showId = await insertShow(4);
    const hold = await createHold({ showId, quantity: 1, tier: 'full', sessionRef: 'sess-expire' });

    // Simulate expiry directly -- the app never does this, but a hold that
    // lapsed 10 minutes ago must behave identically to one that just did.
    await adminPool.query("update hold set expires_at = now() - interval '1 second' where id = $1", [
      hold.id,
    ]);

    await expect(
      confirmHold({ holdId: hold.id, buyerEmail: 'x@example.test', lineTotalMinor: 1000, bookingFeeMinor: 60 }),
    ).rejects.toBeInstanceOf(HoldExpiredError);
  });

  it("enforces RLS on hold reads: a session cannot read another session's hold", async () => {
    const showId = await insertShow(4);
    const hold = await createHold({ showId, quantity: 1, tier: 'full', sessionRef: 'sess-owner' });

    expect(await getHoldForSession(hold.id, 'sess-owner')).not.toBeNull();
    expect(await getHoldForSession(hold.id, 'sess-someone-else')).toBeNull();
  });

  describe('FRG-118: anti-hoarding', () => {
    it('rejects a second live hold from the same session on the same show (the "8 tabs" complaint)', async () => {
      const showId = await insertShow(10);
      await createHold({ showId, quantity: 1, tier: 'full', sessionRef: 'sess-hoarder' });

      await expect(
        createHold({ showId, quantity: 1, tier: 'full', sessionRef: 'sess-hoarder' }),
      ).rejects.toBeInstanceOf(DuplicateHoldError);
    });

    it('allows a new hold once the session\'s previous one has expired', async () => {
      const showId = await insertShow(10);
      const first = await createHold({ showId, quantity: 1, tier: 'full', sessionRef: 'sess-retry' });
      await adminPool.query("update hold set expires_at = now() - interval '1 second' where id = $1", [
        first.id,
      ]);

      await expect(
        createHold({ showId, quantity: 1, tier: 'full', sessionRef: 'sess-retry' }),
      ).resolves.toMatchObject({ sessionRef: 'sess-retry' });
    });

    it('rejects a single basket claiming more than 8 tickets, even with plenty of capacity', async () => {
      const showId = await insertShow(50);

      await expect(
        createHold({ showId, quantity: 9, tier: 'full', sessionRef: 'sess-whale' }),
      ).rejects.toBeInstanceOf(HoldQuantityLimitError);
    });

    it('the same 4-way concurrency proof still holds with distinct sessions once the anti-hoarding rule is in place', async () => {
      const showId = await insertShow(4);

      const results = await Promise.allSettled(
        Array.from({ length: 4 }, (_, i) =>
          createHold({ showId, quantity: 2, tier: 'full', sessionRef: `sess-conc-${i}` }),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
    });
  });
});
