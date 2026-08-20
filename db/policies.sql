-- Row-level security.
--
-- Two audiences:
--   * the public, who may read shows that are on sale, and nothing else
--   * organisers, who may read and write only their own venues, shows and
--     bookings
--
-- venue is done for you as a reference. show and booking are yours.
-- hold is worth a thought too: it is created by anonymous public sessions.

alter table venue enable row level security;

create policy venue_owner_rw on venue
  using (organiser_id = (auth.jwt() ->> 'organiser_id')::uuid)
  with check (organiser_id = (auth.jwt() ->> 'organiser_id')::uuid);

-- show: the public may read shows on sale and not yet started; organisers
-- get full read/write, but only for shows at venues they own. Both
-- policies are scoped with `to <role>`: a policy with no `to` clause
-- applies to every role, so without this an organiser's "my shows" query
-- (running as `authenticated`) would ALSO match show_public_read and leak
-- every other organiser's on_sale shows in alongside their own -- caught
-- by lib/db/organiser-isolation.test.ts, see AI_USAGE.md. `with check` on
-- the owner policy stops an organiser writing (or re-parenting) a show
-- into a venue they don't own -- `using` alone would only have restricted
-- what they could *read back*, not what they could write. Folding
-- `starts_at > now()` into the public policy itself (not just an
-- app-level filter) means a past show is unreachable even by guessing its
-- id directly, matching "past shows never appear to the public" as a
-- database guarantee, not a UI convention.
alter table show enable row level security;

create policy show_public_read on show
  for select
  to anon
  using (status = 'on_sale' and starts_at > now());

create policy show_owner_rw on show
  to authenticated
  using (
    venue_id in (select id from venue where organiser_id = (auth.jwt() ->> 'organiser_id')::uuid)
  )
  with check (
    venue_id in (select id from venue where organiser_id = (auth.jwt() ->> 'organiser_id')::uuid)
  );

-- booking: organisers may read bookings for their own shows. No one -- not
-- even an organiser -- gets a direct write policy. The only way a booking
-- row is created is confirm_hold() in db/functions.sql, a SECURITY DEFINER
-- function that runs the capacity check and the insert as one locked
-- transaction; letting RLS-governed direct inserts exist alongside it
-- would open a second path into the table that the lock doesn't cover.
alter table booking enable row level security;

create policy booking_owner_read on booking
  for select
  to authenticated
  using (
    show_id in (
      select s.id from show s
      join venue v on v.id = s.venue_id
      where v.organiser_id = (auth.jwt() ->> 'organiser_id')::uuid
    )
  );

-- hold: anonymous baskets belong to a browser session, not an organiser, so
-- organiser claims don't apply here at all -- organisers only ever see
-- confirmed bookings, never the holds behind them. A session may read back
-- only its own hold (matched on a `session_ref` claim in the same
-- request.jwt.claims JSON organiser_id lives in -- there is only ever one
-- claims GUC, not a separate one per claim), so one basket can't enumerate
-- another session's in-progress basket. As with booking, there is no
-- direct INSERT/UPDATE policy: holds are created and released only through
-- create_hold()/confirm_hold(), which are SECURITY DEFINER and therefore
-- bypass RLS for their own writes -- RLS here only governs reads back out.
alter table hold enable row level security;

create policy hold_session_read on hold
  for select
  to anon
  using (session_ref = (auth.jwt() ->> 'session_ref'));

-- Base table grants. Real Supabase projects already grant baseline CRUD to
-- `anon`/`authenticated`; db/local-auth-shim.sql creates those roles for
-- dev/test and needs the same grants to exist, so they're declared here
-- rather than duplicated in the shim.
grant usage on schema public to anon, authenticated;
grant select on venue to authenticated;
grant insert, update, delete on venue to authenticated;
grant select on show to anon, authenticated;
grant insert, update, delete on show to authenticated;
grant select on booking to authenticated;
grant select on hold to anon, authenticated;
grant execute on function public_venue_info(uuid) to anon, authenticated;
grant execute on function show_committed(uuid) to anon, authenticated;
grant execute on function committed_quantity(uuid) to anon, authenticated;
grant execute on function create_hold(uuid, int, tier, text) to anon, authenticated;
grant execute on function confirm_hold(uuid, text, bigint, bigint) to anon, authenticated;
