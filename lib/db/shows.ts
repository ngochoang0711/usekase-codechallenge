import type { ShowStatus } from '../domain/types';
import { withRls } from './client';

export interface ShowListItem {
  id: string;
  venueId: string;
  title: string;
  blurb: string | null;
  startsAt: Date;
  durationMins: number;
  capacity: number;
  basePriceMinor: number;
  currency: string;
  status: ShowStatus;
  venueName: string;
  venueCity: string;
  venueTimezone: string;
  /** Raw counts -- feed these into lib/domain/availability.ts's computeAvailability(), don't re-derive sold-out/etc. here. */
  confirmedQty: number;
  liveHoldQty: number;
}

interface ShowListRow {
  id: string;
  venue_id: string;
  title: string;
  blurb: string | null;
  starts_at: Date;
  duration_mins: number;
  capacity: number;
  base_price: string;
  currency: string;
  status: ShowStatus;
  venue_name: string;
  venue_city: string;
  venue_timezone: string;
  confirmed_qty: number;
  live_hold_qty: number;
  total_count: string;
}

function toShowListItem(row: ShowListRow): ShowListItem {
  return {
    id: row.id,
    venueId: row.venue_id,
    title: row.title,
    blurb: row.blurb,
    startsAt: row.starts_at,
    durationMins: row.duration_mins,
    capacity: row.capacity,
    basePriceMinor: Number(row.base_price),
    currency: row.currency,
    status: row.status,
    venueName: row.venue_name,
    venueCity: row.venue_city,
    venueTimezone: row.venue_timezone,
    confirmedQty: row.confirmed_qty,
    liveHoldQty: row.live_hold_qty,
  };
}

export type ShowSort = 'starts_at_asc';

export interface ListShowsParams {
  /** 1-based. */
  page: number;
  pageSize?: number;
  city?: string;
  /** When true, only shows with at least one seat genuinely bookable right now are returned. */
  availableOnly?: boolean;
  sort?: ShowSort;
}

export interface ListShowsResult {
  shows: ShowListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * Public browse query: on-sale, not-yet-started shows only (also enforced
 * independently by db/policies.sql's show_public_read policy -- this
 * query would return the same rows even without the WHERE clause below,
 * but the WHERE clause is what makes pagination/count correct, not what
 * makes it secure). Every row carries the raw confirmed/live-hold counts;
 * callers run them through lib/domain/availability.ts, not this file, to
 * decide what "available" means.
 */
export async function listShows(params: ListShowsParams): Promise<ListShowsResult> {
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, params.page);
  const offset = (page - 1) * pageSize;

  const { rows } = await withRls('anon', null, (client) =>
    client.query<ShowListRow>(
      `select
         s.id, s.venue_id, s.title, s.blurb, s.starts_at, s.duration_mins, s.capacity,
         s.base_price, s.currency, s.status,
         v.name as venue_name, v.city as venue_city, v.timezone as venue_timezone,
         sc.confirmed_qty, sc.live_hold_qty,
         count(*) over() as total_count
       from show s
       cross join lateral public_venue_info(s.venue_id) v
       cross join lateral show_committed(s.id) sc
       where s.status = 'on_sale'
         and s.starts_at > now()
         and ($1::text is null or v.city = $1)
         and (
           $2::boolean is not true
           or greatest(s.capacity - sc.confirmed_qty - sc.live_hold_qty, 0) > 0
         )
       order by s.starts_at asc
       limit $3 offset $4`,
      [params.city ?? null, params.availableOnly ?? false, pageSize, offset],
    ),
  );

  return {
    shows: rows.map(toShowListItem),
    totalCount: rows[0] ? Number(rows[0].total_count) : 0,
    page,
    pageSize,
  };
}

/** Returns null for draft/cancelled/past shows, same as a public visitor guessing the id would see -- RLS enforces this independently. */
export async function getPublicShowById(showId: string): Promise<ShowListItem | null> {
  const { rows } = await withRls('anon', null, (client) =>
    client.query<ShowListRow>(
      `select
         s.id, s.venue_id, s.title, s.blurb, s.starts_at, s.duration_mins, s.capacity,
         s.base_price, s.currency, s.status,
         v.name as venue_name, v.city as venue_city, v.timezone as venue_timezone,
         sc.confirmed_qty, sc.live_hold_qty,
         1 as total_count
       from show s
       cross join lateral public_venue_info(s.venue_id) v
       cross join lateral show_committed(s.id) sc
       where s.id = $1`,
      [showId],
    ),
  );
  const row = rows[0];
  return row ? toShowListItem(row) : null;
}

export interface OrganiserShow {
  id: string;
  venueId: string;
  title: string;
  blurb: string | null;
  startsAt: Date;
  durationMins: number;
  capacity: number;
  basePriceMinor: number;
  currency: string;
  status: ShowStatus;
  confirmedQty: number;
  liveHoldQty: number;
}

interface OrganiserShowRow {
  id: string;
  venue_id: string;
  title: string;
  blurb: string | null;
  starts_at: Date;
  duration_mins: number;
  capacity: number;
  base_price: string;
  currency: string;
  status: ShowStatus;
  confirmed_qty: number;
  live_hold_qty: number;
}

function toOrganiserShow(row: OrganiserShowRow): OrganiserShow {
  return {
    id: row.id,
    venueId: row.venue_id,
    title: row.title,
    blurb: row.blurb,
    startsAt: row.starts_at,
    durationMins: row.duration_mins,
    capacity: row.capacity,
    basePriceMinor: Number(row.base_price),
    currency: row.currency,
    status: row.status,
    confirmedQty: row.confirmed_qty,
    liveHoldQty: row.live_hold_qty,
  };
}

/**
 * Every show belonging to this organiser, any status. Relies on
 * show_owner_rw in db/policies.sql, not an application-level venue_id
 * filter: an organiser_id that doesn't match the caller's own claim
 * returns zero rows, not an error, at the database level.
 */
export async function listOrganiserShows(organiserId: string): Promise<OrganiserShow[]> {
  const { rows } = await withRls('authenticated', { organiser_id: organiserId }, (client) =>
    client.query<OrganiserShowRow>(
      `select
         s.id, s.venue_id, s.title, s.blurb, s.starts_at, s.duration_mins, s.capacity,
         s.base_price, s.currency, s.status,
         sc.confirmed_qty, sc.live_hold_qty
       from show s
       cross join lateral show_committed(s.id) sc
       order by s.starts_at asc`,
    ),
  );
  return rows.map(toOrganiserShow);
}

export interface ShowInput {
  venueId: string;
  title: string;
  blurb: string | null;
  startsAt: Date;
  durationMins: number;
  capacity: number;
  basePriceMinor: number;
  currency: string;
  status: ShowStatus;
}

export class ForbiddenError extends Error {}

function rethrowRlsViolation(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42501'
  ) {
    throw new ForbiddenError('not allowed to write to that venue');
  }
  throw error;
}

export async function createShow(organiserId: string, input: ShowInput): Promise<OrganiserShow> {
  try {
    const { rows } = await withRls('authenticated', { organiser_id: organiserId }, (client) =>
      client.query<OrganiserShowRow>(
        `insert into show (venue_id, title, blurb, starts_at, duration_mins, capacity, base_price, currency, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id, venue_id, title, blurb, starts_at, duration_mins, capacity, base_price, currency, status,
           0 as confirmed_qty, 0 as live_hold_qty`,
        [
          input.venueId,
          input.title,
          input.blurb,
          input.startsAt,
          input.durationMins,
          input.capacity,
          input.basePriceMinor,
          input.currency,
          input.status,
        ],
      ),
    );
    const row = rows[0];
    if (!row) throw new Error('insert into show returned no row');
    return toOrganiserShow(row);
  } catch (error) {
    rethrowRlsViolation(error);
  }
}

export async function updateShow(
  organiserId: string,
  showId: string,
  input: ShowInput,
): Promise<OrganiserShow | null> {
  try {
    const { rows } = await withRls('authenticated', { organiser_id: organiserId }, (client) =>
      client.query<OrganiserShowRow>(
        `update show set
           venue_id = $2, title = $3, blurb = $4, starts_at = $5, duration_mins = $6,
           capacity = $7, base_price = $8, currency = $9, status = $10
         where id = $1
         returning id, venue_id, title, blurb, starts_at, duration_mins, capacity, base_price, currency, status`,
        [
          showId,
          input.venueId,
          input.title,
          input.blurb,
          input.startsAt,
          input.durationMins,
          input.capacity,
          input.basePriceMinor,
          input.currency,
          input.status,
        ],
      ),
    );
    const row = rows[0];
    if (!row) return null; // no row updated: doesn't exist, or RLS hid it (not this organiser's)
    const { rows: committedRows } = await withRls('authenticated', { organiser_id: organiserId }, (client) =>
      client.query<{ confirmed_qty: number; live_hold_qty: number }>(
        'select confirmed_qty, live_hold_qty from show_committed($1)',
        [showId],
      ),
    );
    return toOrganiserShow({
      ...row,
      confirmed_qty: committedRows[0]?.confirmed_qty ?? 0,
      live_hold_qty: committedRows[0]?.live_hold_qty ?? 0,
    });
  } catch (error) {
    rethrowRlsViolation(error);
  }
}

export async function listDistinctCities(): Promise<string[]> {
  const { rows } = await withRls('anon', null, (client) =>
    client.query<{ city: string }>(
      `select distinct v.city
       from show s
       cross join lateral public_venue_info(s.venue_id) v
       where s.status = 'on_sale' and s.starts_at > now()
       order by v.city`,
    ),
  );
  return rows.map((r) => r.city);
}
