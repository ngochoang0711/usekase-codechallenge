-- Dev/test-only shim. Real Supabase already provides the `anon` and
-- `authenticated` roles and the `auth.jwt()` / `auth.uid()` functions that
-- db/policies.sql relies on; this file recreates the same surface against
-- a plain Postgres instance (embedded-postgres locally) so policies.sql
-- runs completely unmodified in both places.
--
-- `auth.jwt()` is implemented exactly the way Supabase implements it: read
-- whatever the app set as the `request.jwt.claims` GUC for this
-- transaction/session. There is nothing Supabase-specific happening here,
-- which is the point -- swap this file out for nothing (it's simply never
-- loaded) when pointed at a real Supabase project.
--
-- NEVER load this file against a real Supabase database.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema if not exists auth;

create or replace function auth.jwt() returns jsonb as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
$$ language sql stable;

create or replace function auth.uid() returns uuid as $$
  select (auth.jwt() ->> 'sub')::uuid;
$$ language sql stable;
