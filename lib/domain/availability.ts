import type { HoldRecord } from './types';

/**
 * FRG-118: caps how many seats one basket can claim, so a single hold
 * can't consume an entire small venue's capacity. Enforced in
 * db/functions.sql's create_hold() (the actual defense); mirrored here so
 * the hold form's quantity input can't even be pushed past it client-side.
 */
export const MAX_HOLD_QUANTITY = 8;

export interface Availability {
  /** Seats genuinely bookable right now: capacity minus confirmed and live holds. */
  seatsLeft: number;
  /** Capacity is permanently gone -- confirmed bookings alone fill it. No hold expiring helps. */
  isSoldOut: boolean;
  /** Capacity exists, but everything is currently held by other baskets. Will free up as holds expire. */
  isTemporarilyUnavailable: boolean;
}

/**
 * The single definition of "available" for a show. The browse page, the
 * hold/confirm flow and the concierge tool all call this -- see
 * CLAUDE.md non-negotiable #5. db/functions.sql enforces the same
 * capacity+liveness rule independently, in the database, as the actual
 * defense against oversell; this function is what decides what people see.
 */
export function computeAvailability(
  capacity: number,
  confirmedQty: number,
  liveHoldsQty: number,
): Availability {
  const committed = confirmedQty + liveHoldsQty;
  const isSoldOut = confirmedQty >= capacity;
  const isTemporarilyUnavailable = !isSoldOut && committed >= capacity;
  const seatsLeft = Math.max(0, capacity - committed);

  return { seatsLeft, isSoldOut, isTemporarilyUnavailable };
}

/**
 * A hold counts toward committed inventory only while it is live: not
 * explicitly released, and not past its expiry instant. Mirrors the
 * `released_at is null and expires_at > now()` filter in
 * db/functions.sql's committed_quantity() -- keep both in sync.
 *
 * The boundary is exclusive: a hold expiring at exactly `now` no longer
 * counts (see db/seed.sql's "sess-boundary" fixture and this file's test).
 */
export function isHoldLive(hold: Pick<HoldRecord, 'releasedAt' | 'expiresAt'>, now: Date): boolean {
  return hold.releasedAt === null && hold.expiresAt.getTime() > now.getTime();
}
