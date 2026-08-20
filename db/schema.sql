-- Fringe - seed schema.
--
-- NOTE FOR CANDIDATES: this is a starting point, not a finished design. It has
-- at least three problems in it. `npm run guard` will point at some of them.
-- Fix them properly rather than exempting them.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

create table organiser (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table venue (
  id            uuid primary key default gen_random_uuid(),
  organiser_id  uuid not null references organiser(id) on delete cascade,
  name          text not null,
  city          text not null,
  timezone      text not null,          -- IANA name, e.g. 'Asia/Singapore'
  created_at    timestamptz not null default now()
);

create type show_status as enum ('draft', 'on_sale', 'cancelled');

create table show (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venue(id) on delete cascade,
  title           text not null,
  blurb           text,
  starts_at       timestamptz not null,
  duration_mins   int not null check (duration_mins > 0),
  capacity        int not null check (capacity >= 0),
  base_price      bigint not null check (base_price >= 0),  -- minor units
  currency        text not null default 'SGD',
  status          show_status not null default 'draft',
  created_at      timestamptz not null default now()
);

create index on show (starts_at);

create type tier as enum ('full', 'concession', 'under26');

-- A basket. Expires 10 minutes after creation, then its seats go back.
create table hold (
  id           uuid primary key default gen_random_uuid(),
  show_id      uuid not null references show(id) on delete cascade,
  session_ref  text not null,                       -- anonymous browser session
  quantity     int not null check (quantity > 0),
  tier         tier not null default 'full',
  expires_at   timestamptz not null,
  released_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table booking (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid not null references show(id) on delete restrict,
  hold_id        uuid unique references hold(id) on delete set null,
  buyer_email    text not null,
  quantity       int not null check (quantity > 0),
  tier           tier not null default 'full',
  line_total     bigint not null,   -- minor units, before fee
  booking_fee    bigint not null,   -- minor units
  grand_total    bigint not null check (grand_total = line_total + booking_fee),
  confirmed_at   timestamptz not null default now()
);

-- Oversell prevention (create_hold / confirm_hold, a row lock on `show`) and
-- the local Supabase-auth shim used in dev/test live in db/functions.sql.
-- RLS policies live in db/policies.sql.
