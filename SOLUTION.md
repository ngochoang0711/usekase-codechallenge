# SOLUTION.md

## What I built

The full "Must have" list: browse/hold/confirm (FRG-101), the anti-hoarding
rules (FRG-118), both FRG-121 timezone bugs found and fixed with failing
tests first, and the concierge tool (FRG-130). Plus a working RLS story
(organiser isolation, proven against the seeded Mei/Darren data, not just
declared) and a real concurrent-writes proof for oversell prevention.

- **Browse** (`app/page.tsx`): paginated 10/page with a total count, city
  and availability filters, sorted by start time, distinct loading
  (`app/loading.tsx`), error (`app/error.tsx`) and empty states.
- **Hold → countdown → confirm** (`app/shows/[id]`): a live countdown
  client component, a distinct "your basket expired, seats are back" state,
  and money that's provably right down to the cent (below).
- **Organiser view** (`app/organiser`): create/edit your own shows, see
  your own bookings, backed entirely by RLS rather than app-level
  filtering — several of the queries deliberately don't filter by
  organiser at all, to prove the database is what's actually stopping
  cross-tenant reads.
- **Concierge tool** (`lib/tools/findAvailableShows.ts`): Zod-validated in,
  typed out, built entirely from the same `listShows()` query and the same
  `computeAvailability()` function everything else uses.

## Decisions and trade-offs

**DB engine: `embedded-postgres`, not the Supabase CLI, and not
`pglite`.** No Docker was available in my dev environment. I initially
picked `@electric-sql/pglite` (WASM Postgres), then reversed that after
research showed pglite's JS driver serializes every query/transaction
through an internal mutex — a `Promise.all` of "concurrent" calls against
it never actually overlaps in the database, which would have made the
"test that actually runs writes in parallel" CLAUDE.md requires
impossible to satisfy honestly. `embedded-postgres` runs a real native
Postgres binary (Postgres 18, no Docker, no admin rights) as a plain child
process, giving genuinely independent pooled connections. Everything in
`db/` is portable SQL with no pglite/embedded-postgres-specific syntax, so
pointing `DATABASE_URL` at a real Supabase project works unmodified,
except for `db/local-auth-shim.sql`, which should never be loaded there
(see below).

**Oversell prevention is a row lock, not a constraint.** `create_hold()`
and `confirm_hold()` (`db/functions.sql`) both open with `select capacity
from show where id = $1 for update`. That lock serializes every
concurrent writer touching a given show's inventory, so the capacity
check and the insert that follows it are atomic with respect to everyone
else — no read-then-write race is possible, regardless of how many
requests arrive at once. Both functions are the *only* write path into
`hold`/`booking`; there is no second route in for a race to hide in. This
is proven, not asserted — see "How I know it can't oversell" below.

**Availability logic exists exactly once**
(`lib/domain/availability.ts:computeAvailability`). The browse page, the
hold flow, the organiser dashboard, and the concierge tool all call it
from the same two raw counts (confirmed bookings, live holds), fetched via
`show_committed()` — a narrow `SECURITY DEFINER` SQL function that exposes
just those two integers without opening `booking`/`hold` (which carry
buyer_email/session_ref) to public reads. "Sold out" means confirmed
bookings alone fill capacity — nothing expiring helps. "Temporarily
unavailable" means capacity exists but every seat is currently in someone
else's basket. The browse page's SQL filter for "available only" inlines
the same arithmetic for pagination correctness, but the *decision* — which
label to show, whether to filter it out — is made in exactly one place.

**RLS runs from a single administrative connection, PostgREST-style.**
`lib/db/client.ts`'s pool logs in as the migration superuser (needed to
own every table), and every read/write goes through `withRls()`, which
`SET LOCAL`s the current role and a `request.jwt.claims` GUC inside an
explicit transaction before running the query — scoped to that
transaction only, so a reused pooled connection can never leak one
caller's role/claims into the next. This mirrors how PostgREST itself
enforces RLS from one admin connection, and it means RLS is genuinely
evaluated on every query in `lib/db`, not bypassed as table owner. The
cost: correctness depends on every `lib/db` function actually routing
through `withRls()` rather than a raw query — I made that the *only*
function in the file that touches the pool directly, so there's no
alternate path to reach for by accident.

**Money**: integer minor units throughout, never a float
(`lib/domain/money.ts`). Tier prices and the 6%-capped-at-$9 fee are
pinned against `db/seed.sql`'s actual booking rows, not assumed — e.g.
concession's 70% and the fee formula both fall out of matching "Last Four
Seats"' and "Gala Night"'s seeded totals exactly. `booking.grand_total`
has a database `check (grand_total = line_total + booking_fee)` — the
schema itself refuses to store a row that violates the invariant, not
just the application.

## FRG-118: my acceptance criteria

The director's complaint (hoarding, "8 tabs on one show", popular shows
looking sold out for ages) became this scope, written before touching
`create_hold()`:

1. **One live hold per session per show at a time.** A second hold
   attempt from the same session while one is still live is rejected with
   a clear message — closes the "8 tabs" complaint directly. Enforced
   inside the same show-row lock the capacity check already takes, so two
   tabs racing each other are serialized the same way oversell prevention
   is: race-safe for free, not an afterthought.
2. **A basket is capped at 8 tickets**, so one hold can't consume an
   entire small venue's capacity by itself.
3. **No change to the 10-minute duration** — the brief fixes that — but
   the UI shows the countdown prominently, and "temporarily unavailable"
   (not "sold out") is shown whenever the only thing standing between a
   customer and a seat is someone else's basket expiring. That's the
   direct answer to "popular shows look sold out for ages": they aren't
   sold out, and the UI now says so.
4. **Explicitly not built**: IP throttling, CAPTCHA, waitlists (that's the
   separate Nice to Have), or account-level purchase limits. Out of scope
   for the core, and cheap to add later on top of the same lock if it
   turns out to matter.

## FRG-121: the bug(s)

Two distinct bugs, both explaining why Melbourne testers saw it and
Singapore testers couldn't:

1. **`hold.expires_at` was `timestamp`, not `timestamptz`** — the bug
   `db/schema.sql`'s own comment pointed at. A naive timestamp serialized
   to a client carries no UTC offset, so a browser can misread the same
   digits as local time instead of UTC — in Melbourne (UTC+10/+11) that's
   a multi-hour misread; in Singapore (UTC+8, but the bug happened to
   still misbehave less obviously there) it was easy to miss. Fixed by
   changing the column to `timestamptz`.
2. **Show-time rendering used a fixed UTC offset instead of asking the
   real IANA timezone database for the offset at that specific instant.**
   The seeded "2am Monologue" show (`2026-10-04T15:30:00Z`, a Melbourne
   venue) sits right at the AEDT daylight-saving transition. A fixed
   Australia/Melbourne offset of +10 gives 01:30 the next day; the correct
   answer, accounting for the transition, is 02:30 — exactly the "listed
   as 2am, actually on at 1am" report. Fixed in `lib/domain/time.ts`,
   which always converts through `Intl.DateTimeFormat` evaluated against
   the show's actual instant.

Tests pin both: `lib/domain/time.test.ts` asserts the DST-boundary show
renders 2:30, not 1:30, and cross-checks against Node's own ICU data
before the assertion was even written (see `AI_USAGE.md`). The naive-
timestamp fix is proven structurally, by the column type itself plus
`scripts/integrity-guard.ts`'s check for it.

## How I know it can't oversell

The mechanism: `create_hold()`/`confirm_hold()` (`db/functions.sql`) both
lock the show row (`for update`) before reading committed quantity, so
every concurrent writer for the same show serializes through that lock —
the capacity check and the insert are atomic with respect to each other.

The proof: `lib/db/holds.test.ts` fires genuinely concurrent `createHold()`
calls — real pooled Postgres connections, not simulated — against shows
with less capacity than demand (4 requests × qty 2 against capacity 4;
10 requests × qty 1 against capacity 3) and asserts exactly capacity-worth
succeed, the rest get a typed `SoldOutError`, and the database's own
committed total never exceeds capacity. This only proves anything because
the DB engine underneath (`embedded-postgres`) gives real independent
connections — see the DB engine decision above, and `AI_USAGE.md` for why
the original choice (pglite) would have made this test pass without
proving anything.

## FRG-130: what `onDate` means across four timezones

A calendar date **in the venue's own local timezone**, not UTC and not the
caller's timezone. "Shows on 2026-10-04" resolves to
`[2026-10-04T00:00, 2026-10-05T00:00)` converted through that specific
venue's IANA zone (`lib/domain/time.ts`'s `localDateRangeUtc`), so a show
a few hours either side of UTC midnight lands on the date its own audience
would call it. This is deliberately exercised against the DST-boundary
show in `lib/tools/findAvailableShows.test.ts`: `onDate: "2026-10-04"`
does *not* match it (its Melbourne-local date is the 5th), `onDate:
"2026-10-05"` does.

## Running it

No Docker needed — the whole DB layer runs on a bundled native Postgres
binary via `embedded-postgres` (see the DB engine decision above). This
repo's `db/schema.sql`/`policies.sql`/`functions.sql` are still plain
portable SQL, so a real Supabase/Postgres 15+ instance works too if you'd
rather use one (skip `db/local-auth-shim.sql` in that case — Supabase
already provides `anon`/`authenticated` and `auth.jwt()`).

```bash
npm install
npm run db:reset   # starts Postgres 18 locally, applies schema+seed, leaves it running
```

`db:reset` prints the `DATABASE_URL` it's running on
(`postgres://postgres:postgres@localhost:54330/fringe` by default) and
leaves the server running in the background for `npm run dev`. **Known
quirk in this environment**: the script's own Node process can appear to
hang after printing "Done." — Postgres has already started successfully
by then (this is an inherited-stdio-handle artifact on Windows, not a
stuck migration); Ctrl+C is safe once you see "Done."

```bash
echo 'DATABASE_URL=postgres://postgres:postgres@localhost:54330/fringe' > .env.local
npm run dev
```

Then: browse at `/`, sign in as an organiser at `/organiser/login` (Mei or
Darren, per `docs/SETUP.md` — no password, see "what I cut" below).

`npm run verify` (lint, typecheck, test, `scripts/integrity-guard.ts`)
spins up its own throwaway Postgres instance via `lib/test/global-setup.ts`
and doesn't touch the dev database at all.

## What I cut, and why

- **Real auth.** Organiser sign-in is a cookie set by picking one of two
  seeded organisers, no password. What's assessed here — RLS blocking
  cross-organiser access even when the app forgets to filter — is fully
  real regardless; only the login UX is stubbed. Swapping in Supabase Auth
  later doesn't change anything downstream of the cookie.
- **Payment.** `confirm_hold()` takes a buyer email and produces a
  confirmed booking with no payment step. A real version needs a payment
  intent created before the hold is confirmed, and `confirm_hold()`
  gated on it succeeding.
- **A hold-expiry sweep job.** Not needed for correctness — an expired
  hold stops counting the instant `now()` passes `expires_at`, because
  every capacity check filters on it live — but a periodic sweep would
  keep the `hold` table from accumulating dead rows forever and make
  "how many holds exist right now" queries cheaper over time.
- **Waitlists, optimistic UI rollback, a Claude Code slash command,
  deployment.** All explicitly "Nice to have" in the brief; the core took
  the full time budget to get right, including the two RLS bugs
  `AI_USAGE.md` describes catching mid-build.
- **A second sort order.** Only ascending by start time. Nothing in the
  brief asked for descending, and it was cheaper to spend the time on the
  RLS/concurrency proofs.

## What I'd fix before this took real money

- **Non-superuser login role for the app pool.** Right now correctness
  depends on every `lib/db` function routing through `withRls()` — true
  today because it's the only function touching the pool, but a real
  production setup would also want the *login* role itself to be
  non-superuser, so a mistake can't silently bypass RLS by skipping the
  helper.
- **Idempotency keys on `confirm_hold`.** A network retry on the confirm
  request today would hit "hold not found" (since it's already released)
  rather than safely returning the existing booking — not dangerous, but
  a bad retry experience worth fixing before real payment is involved.
- **Structured logging and metrics on the hold/confirm path** — first
  thing I'd want when a show's row lock becomes a genuine contention
  hotspot (a very popular on-sale moment), to know whether it's actually
  a problem before reaching for anything fancier than the row lock this
  already has.
- **Rate limiting hold creation per session/IP**, on top of the one-live-
  hold-per-session rule, against sheer request volume rather than basket
  count.
