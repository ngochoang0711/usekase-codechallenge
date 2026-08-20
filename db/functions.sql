-- Oversell prevention and the hold/booking lifecycle.
--
-- `hold` and `booking` have exactly one write path each into the app:
-- create_hold() and confirm_hold() below. There is no other route in, so
-- there is no read-then-write path around the lock they take.
--
-- The lock: both functions start with
--   select capacity from show where id = $1 for update
-- which takes a row lock on the show being booked. Every concurrent
-- transaction that wants to write inventory for the *same* show must wait
-- for that lock before it can even read the current committed quantity, so
-- the capacity check and the insert that follows are atomic with respect to
-- every other writer touching that show. That is what makes oversell
-- impossible under concurrent writes (CLAUDE.md non-negotiable #1), proven
-- for real concurrent connections in lib/db/holds.test.ts.
--
-- "Committed" = confirmed bookings + holds that are live right now
-- (released_at is null and expires_at > now()). An expired, unswept hold
-- stops counting the instant now() passes expires_at -- no separate sweep
-- job is required for correctness. This definition mirrors
-- lib/domain/availability.ts, the single source of truth for what the UI,
-- the booking flow and the concierge tool consider "available"; keep both
-- in sync if either changes.
--
-- Both functions are SECURITY DEFINER: they run as their owner (the
-- migration role, which owns every table), so their internal writes are
-- not subject to RLS. That is deliberate -- see db/policies.sql for why
-- `hold` and `booking` carry no direct INSERT policy for any role. The
-- function body is the entire access-control boundary for writes to those
-- two tables, so `set search_path` is pinned to stop search-path hijacking
-- from substituting a different `show`/`hold`/`booking`.

-- `venue` (per db/policies.sql) has no public-read policy at all -- it's
-- owner-only, on purpose. The browse page still legitimately needs a
-- show's venue name/city/timezone to render it, so that narrow, non-
-- sensitive slice is exposed the same way show_committed exposes booking/
-- hold aggregates: a SECURITY DEFINER function, not a table grant. Calling
-- it with a venue_id you got from a show row you can already see (via
-- show_public_read) doesn't leak anything new.
create or replace function public_venue_info(p_venue_id uuid)
returns table(name text, city text, timezone text) as $$
  select v.name, v.city, v.timezone from venue v where v.id = p_venue_id;
$$ language sql stable security definer set search_path = public, pg_temp;

-- Exposed to anon/authenticated so the browse page and the concierge tool
-- can compute availability without any direct SELECT on `booking`/`hold`
-- (which carry buyer_email/session_ref -- legitimately private). It's the
-- narrow, PII-free aggregate that lib/domain/availability.ts needs its two
-- inputs from; the actual sold-out-vs-temporarily-unavailable decision
-- still lives only in that one TS function, not here.
create or replace function show_committed(p_show_id uuid)
returns table(confirmed_qty int, live_hold_qty int) as $$
  select
    coalesce((select sum(quantity) from booking where show_id = p_show_id), 0)::int,
    coalesce((select sum(quantity) from hold
                where show_id = p_show_id
                  and released_at is null
                  and expires_at > now()), 0)::int;
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function committed_quantity(p_show_id uuid) returns int as $$
  select confirmed_qty + live_hold_qty from show_committed(p_show_id);
$$ language sql stable security definer set search_path = public, pg_temp;

create or replace function create_hold(
  p_show_id uuid,
  p_quantity int,
  p_tier tier,
  p_session_ref text
) returns hold as $$
declare
  v_capacity int;
  v_status show_status;
  v_starts_at timestamptz;
  v_committed int;
  v_hold hold;
begin
  select capacity, status, starts_at into v_capacity, v_status, v_starts_at
    from show where id = p_show_id for update;

  if v_capacity is null then
    raise exception 'show not found' using errcode = 'FR002';
  end if;

  if v_status <> 'on_sale' or v_starts_at <= now() then
    raise exception 'show is not bookable' using errcode = 'FR005';
  end if;

  -- FRG-118: one live basket per session per show, and a basket can't
  -- claim more than MAX_HOLD_QUANTITY (8) seats -- see lib/domain's
  -- matching constant. Both checks run inside the same show-row lock
  -- already taken above, so a session opening two tabs and racing them
  -- against each other is serialized the same way oversell is: whichever
  -- create_hold call gets the lock first commits its hold, and the second
  -- sees it when it reads `hold` afterward, not before.
  if exists (
    select 1 from hold
    where show_id = p_show_id
      and session_ref = p_session_ref
      and released_at is null
      and expires_at > now()
  ) then
    raise exception 'you already have a basket for this show' using errcode = 'FR006';
  end if;

  if p_quantity > 8 then
    raise exception 'a basket is limited to 8 tickets' using errcode = 'FR007';
  end if;

  v_committed := committed_quantity(p_show_id);

  if v_committed + p_quantity > v_capacity then
    raise exception 'show is sold out' using errcode = 'FR001';
  end if;

  insert into hold (show_id, session_ref, quantity, tier, expires_at)
  values (p_show_id, p_session_ref, p_quantity, p_tier, now() + interval '10 minutes')
  returning * into v_hold;

  return v_hold;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function confirm_hold(
  p_hold_id uuid,
  p_buyer_email text,
  p_line_total bigint,
  p_booking_fee bigint
) returns booking as $$
declare
  v_hold hold;
  v_capacity int;
  v_committed int;
  v_booking booking;
begin
  select * into v_hold from hold where id = p_hold_id for update;

  if v_hold is null then
    raise exception 'hold not found' using errcode = 'FR003';
  end if;

  if v_hold.released_at is not null or v_hold.expires_at <= now() then
    raise exception 'hold has expired' using errcode = 'FR004';
  end if;

  select capacity into v_capacity from show where id = v_hold.show_id for update;

  -- committed_quantity() already counts this hold; back it out before
  -- re-checking, since converting a live hold into a booking does not add
  -- new demand on top of what it already reserved.
  v_committed := committed_quantity(v_hold.show_id) - v_hold.quantity;

  if v_committed + v_hold.quantity > v_capacity then
    raise exception 'show is sold out' using errcode = 'FR001';
  end if;

  insert into booking (show_id, hold_id, buyer_email, quantity, tier, line_total, booking_fee, grand_total)
  values (v_hold.show_id, v_hold.id, p_buyer_email, v_hold.quantity, v_hold.tier,
          p_line_total, p_booking_fee, p_line_total + p_booking_fee)
  returning * into v_booking;

  update hold set released_at = now() where id = v_hold.id;

  return v_booking;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
