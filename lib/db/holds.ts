import type { HoldRecord, Tier } from '../domain/types';
import { withRls } from './client';

export class SoldOutError extends Error {}
export class ShowNotFoundError extends Error {}
export class ShowNotBookableError extends Error {}
export class HoldNotFoundError extends Error {}
export class HoldExpiredError extends Error {}
export class DuplicateHoldError extends Error {}
export class HoldQuantityLimitError extends Error {}

// db/functions.sql's custom SQLSTATEs -- see the comment there for why
// these aren't the P0XXX range (those already mean something else).
const ERROR_CLASSES: Record<string, new (message: string) => Error> = {
  FR001: SoldOutError,
  FR002: ShowNotFoundError,
  FR003: HoldNotFoundError,
  FR004: HoldExpiredError,
  FR005: ShowNotBookableError,
  FR006: DuplicateHoldError,
  FR007: HoldQuantityLimitError,
};

function isDbError(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

function rethrowTyped(error: unknown): never {
  if (isDbError(error)) {
    const ErrorClass = ERROR_CLASSES[error.code];
    if (ErrorClass) {
      throw new ErrorClass(error.message);
    }
  }
  throw error;
}

interface HoldRow {
  id: string;
  show_id: string;
  session_ref: string;
  quantity: number;
  tier: Tier;
  expires_at: Date;
  released_at: Date | null;
}

function toHoldRecord(row: HoldRow): HoldRecord {
  return {
    id: row.id,
    showId: row.show_id,
    sessionRef: row.session_ref,
    quantity: row.quantity,
    tier: row.tier,
    expiresAt: row.expires_at,
    releasedAt: row.released_at,
  };
}

export async function createHold(input: {
  showId: string;
  quantity: number;
  tier: Tier;
  sessionRef: string;
}): Promise<HoldRecord> {
  try {
    const { rows } = await withRls('anon', { session_ref: input.sessionRef }, (client) =>
      client.query<HoldRow>('select * from create_hold($1, $2, $3, $4)', [
        input.showId,
        input.quantity,
        input.tier,
        input.sessionRef,
      ]),
    );
    const row = rows[0];
    if (!row) throw new Error('create_hold returned no row');
    return toHoldRecord(row);
  } catch (error) {
    rethrowTyped(error);
  }
}

export interface ConfirmedBooking {
  id: string;
  showId: string;
  holdId: string | null;
  buyerEmail: string;
  quantity: number;
  tier: Tier;
  lineTotalMinor: number;
  bookingFeeMinor: number;
  grandTotalMinor: number;
  confirmedAt: Date;
}

interface BookingRow {
  id: string;
  show_id: string;
  hold_id: string | null;
  buyer_email: string;
  quantity: number;
  tier: Tier;
  line_total: string;
  booking_fee: string;
  grand_total: string;
  confirmed_at: Date;
}

function toBooking(row: BookingRow): ConfirmedBooking {
  return {
    id: row.id,
    showId: row.show_id,
    holdId: row.hold_id,
    buyerEmail: row.buyer_email,
    quantity: row.quantity,
    tier: row.tier,
    lineTotalMinor: Number(row.line_total),
    bookingFeeMinor: Number(row.booking_fee),
    grandTotalMinor: Number(row.grand_total),
    confirmedAt: row.confirmed_at,
  };
}

export async function confirmHold(input: {
  holdId: string;
  buyerEmail: string;
  lineTotalMinor: number;
  bookingFeeMinor: number;
}): Promise<ConfirmedBooking> {
  try {
    const { rows } = await withRls('anon', null, (client) =>
      client.query<BookingRow>('select * from confirm_hold($1, $2, $3, $4)', [
        input.holdId,
        input.buyerEmail,
        input.lineTotalMinor,
        input.bookingFeeMinor,
      ]),
    );
    const row = rows[0];
    if (!row) throw new Error('confirm_hold returned no row');
    return toBooking(row);
  } catch (error) {
    rethrowTyped(error);
  }
}

/** A session may only read back its own hold -- enforced by db/policies.sql's hold_session_read policy, not just this filter. */
export async function getHoldForSession(holdId: string, sessionRef: string): Promise<HoldRecord | null> {
  const { rows } = await withRls('anon', { session_ref: sessionRef }, (client) =>
    client.query<HoldRow>('select * from hold where id = $1', [holdId]),
  );
  const row = rows[0];
  return row ? toHoldRecord(row) : null;
}

/** So a page refresh resumes an in-progress basket instead of losing track of it. RLS (not this WHERE clause) is what stops it finding anyone else's. */
export async function getLiveHoldForSessionAndShow(
  showId: string,
  sessionRef: string,
): Promise<HoldRecord | null> {
  const { rows } = await withRls('anon', { session_ref: sessionRef }, (client) =>
    client.query<HoldRow>(
      `select * from hold
       where show_id = $1 and released_at is null and expires_at > now()
       order by created_at desc
       limit 1`,
      [showId],
    ),
  );
  const row = rows[0];
  return row ? toHoldRecord(row) : null;
}
