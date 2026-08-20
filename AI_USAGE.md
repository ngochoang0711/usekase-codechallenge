# AI_USAGE.md

This was written as the work happened (see the commit history timestamps),
not reconstructed from memory at the end.

## Setup

- `CLAUDE.md`: extended, not replaced. It shipped with the five
  non-negotiables (oversell, integer money, timestamptz, strict TS, one
  availability function) and the `lib/domain` / `lib/db` / `lib/tools`
  layout already decided; everything built here follows that layout rather
  than inventing a different one.
- Read every provided file before writing anything: `CLAUDE.md`,
  `README.md`, `docs/SETUP.md`, `docs/TICKETS.md`, `db/schema.sql`,
  `db/policies.sql`, `db/seed.sql`, `scripts/integrity-guard.ts`, both
  templates, `.github/workflows/ci.yml`.
- Checked the environment before assuming anything: no Docker, no local
  `psql`, Node 24 available, directory not yet a git repo. `docs/SETUP.md`
  explicitly says not to burn time fighting environment friction, so the
  DB story got resolved deliberately rather than worked around silently
  (see the prompt below).
- Used Claude Code's plan mode before any multi-file implementation, per
  `CLAUDE.md`'s own working agreement ("plan before editing anything that
  touches more than two files") — this is a from-scratch build of the
  whole app, so planning wasn't optional. Used a `Plan`-type research
  subagent from inside plan mode specifically to pressure-test the DB
  engine choice against its own source/issues before committing to it,
  rather than assuming a well-known package would just work.
- Committed to small, real commits from the start, and to using
  `AskUserQuestion` rather than guessing on decisions that weren't mine to
  make unilaterally alone (see below).
- Nothing project-specific was committed to Claude Code settings/config
  beyond what's in this repo (CLAUDE.md itself, this file, `SOLUTION.md`).

## Two or three prompts that mattered

**"No Docker or local Postgres is available in this environment. How
should we get a real Postgres to develop and test the oversell-prevention
logic against?"** (an `AskUserQuestion` I raised, with `@electric-sql/pglite`
as the recommended option) — the user picked pglite. That answer then got
revised one step later without going back to the user, because a research
subagent found pglite's JS driver serializes every query/transaction
through an internal mutex, meaning a `Promise.all` of "concurrent" calls
against it never actually overlaps in the database. A concurrency test
built on it would have passed regardless of whether the row-lock actually
worked. This mattered because it's exactly the kind of gap that looks like
a working setup right up until the one test that's supposed to prove the
hardest requirement in the whole brief. Switched to `embedded-postgres`
(a real native Postgres binary run as a plain child process, no Docker)
instead, verified hands-on with a throwaway 4-way concurrent-booking spike
before building anything real on top of it.

**"please make sure to Copy AI_USAGE.template.md and fill it in as you go,
not from memory at the end"** — a direct instruction from the user mid-way
through planning. It landed while still inside plan mode, which only
allows editing the plan file — so the honest response was to say so
explicitly rather than either ignore the harness restriction or silently
comply, log the setup facts into the plan file live instead, and create
this actual file as literally the first thing done once the plan was
approved. Worth keeping as a prompt "that mattered" because it's the
reason this file has real timestamps behind it instead of being
reconstructed from memory at the end, which is the whole point of the
instruction.

**The initial project read-through instruction** ("Before changing code,
read and understand: CLAUDE.md, db/schema.sql, ... existing application
structure") set the tone for the rest of the session: read first, plan
before touching more than two files, verify claims by actually running
things rather than trusting that a config or a library does what its
README says.

## Where it helped with design and architecture

The DB engine decision above is the clearest example: research surfaced a
specific, sourced technical reason (pglite's `#transactionMutex`, and
`pglite-socket`'s own maintainers reproducing permanent hangs on
overlapping transactions) rather than a vague "pglite might not be
production-grade" hand-wave. That's a case where delegating the research
step produced a better decision than either guessing or spending the same
time reading pglite's source personally.

## Where it was confidently wrong

While building `lib/db/holds.ts` and the RLS policies together, I (writing
as Claude Code) wrote two pieces of code that looked individually correct,
read fine on review, and were inconsistent with each other in a way that
silently broke the feature:

- `db/policies.sql`'s `hold_session_read` policy: `using (session_ref =
  current_setting('request.session_ref', true))`.
- `lib/db/client.ts`'s `withRls()` helper: packs `session_ref` as a nested
  key inside the single `request.jwt.claims` JSON GUC (the same GUC
  `organiser_id` claims travel in), and never sets a separate
  `request.session_ref` GUC at all.

Both pieces of SQL are individually valid, plausible-looking Postgres, and
the mismatch is exactly the kind of thing that's easy to miss reading the
diff, because each file looks right in isolation — you have to hold both
files in your head at once and notice the GUC names don't match. It didn't
show up in `db/schema.sql`, `scripts/integrity-guard.ts` (which only
pattern-matches, not executes), or in eyeballing either file. It showed up
the moment an actual test exercised it: `lib/db/holds.test.ts`'s "a session
cannot read another session's hold" test failed with the *owning* session
also getting `null` back, not just the wrong one — a clear signal the
lookup was broken for everyone, not just insecure for one case.

Fix: changed the policy to read the same claims JSON everything else uses
— `using (session_ref = (auth.jwt() ->> 'session_ref'))` — so there is
exactly one claims-carrying GUC in the whole system, not two. The
prompting change afterwards: when a policy and the code that's supposed to
satisfy it are written in the same pass, write a test that exercises the
*positive* case (the owner reading their own row) before the negative one,
specifically because an RLS bug that denies everyone reads as "secure" if
you only ever check the negative case.

**A second, more serious one, caught the same way immediately after:**
`show_public_read` and the other policies I wrote had no `to <role>`
clause. A Postgres RLS policy with no `to` clause applies to *every* role
that reaches the table, not just the one it was written for, and multiple
permissive policies for the same command are OR'd together. So
`lib/db/shows.ts`'s `listOrganiserShows(organiserId)` -- which runs as
`authenticated` -- was *also* matching `show_public_read`, meaning
Darren's "my shows" query returned his own draft shows correctly, plus
every other organiser's on-sale shows leaking in through the public
policy. That's the exact failure CLAUDE.md's top non-negotiable names
directly ("an organiser must not be able to read ... another organiser's
shows ... even if an API route forgets to filter") -- and it happened
despite the API route in question filtering nothing wrong at all; the
policy meant to be the backstop was itself the leak. Caught by
`lib/db/organiser-isolation.test.ts` asserting Darren's own list did *not*
contain Mei's "Last Four Seats". Fixed by adding `to anon` /
`to authenticated` to every policy I'd written (`venue_owner_rw`, the one
policy provided as a reference, has the same gap in principle, but it's
inert in practice since `anon` is never granted any privilege on `venue`
at all -- left it alone rather than "fixing" code I was told was a
reference). Changed habit afterwards: every `create policy` now gets an
explicit `to` clause as it's written, not added after a test catches its
absence.

**A third, different flavour, caught only by actually running the app in
a browser (not by any automated test):** `app/organiser/actions.ts`'s
`showFormSchema` used Zod's `z.string().uuid()` for `venueId`. Zod's
`.uuid()` enforces RFC 4122's version/variant nibbles; `db/seed.sql`'s
deliberately-readable placeholder ids (`0b000000-0000-0000-0000-
000000000001`) don't have them, so editing any seeded show failed
immediately with a raw Zod error dumped onto the page by the error
boundary. Every automated test that touched `create_hold`/`updateShow`
inserted rows via raw SQL or called the DB functions directly, so none of
them ever passed a seed id through this specific validator — the gap was
invisible until "start the dev server and use the feature in a browser"
actually happened. Fixed by validating the UUID's *shape* with a regex
instead of RFC 4122 compliance, since a real `gen_random_uuid()` value
would satisfy either check anyway and the actual authorization check is
the RLS `with check`, not the shape of the string. This is the concrete
argument for why "run it in a browser before calling it done" is a real
step, not a formality: three RLS/db tests suites and 46 passing tests
didn't catch this because none of them exercised this exact form.

## What you rejected

- **pglite**, after initially agreeing to use it (see above) — not because
  it's broken, but because it structurally cannot produce the one proof
  CLAUDE.md explicitly asks for ("a test that actually runs writes in
  parallel"), and a test that looks like that proof without being one is
  worse than admitting no test exists.
- **Column-level fee/pricing logic in SQL.** It would have been easy to
  compute `line_total`/`booking_fee` inside `confirm_hold()` directly from
  `base_price` and `tier`, duplicating `lib/domain/money.ts`'s rounding
  rules in a second language. Rejected in favour of the TS layer computing
  both and passing them in as already-rounded integers, with the DB only
  enforcing the *invariant* (`grand_total = line_total + booking_fee`) via
  a `check` constraint — money logic exists once, the database just
  refuses to store a row that violates its output.
- **TypeScript 7** (the newly-released native/Go-rewritten compiler) as the
  project's `typescript` version, purely because `npm view typescript
  version` returned it as `latest`. `typescript-eslint` throws a hard
  runtime error rather than a warning when run against TS 7
  ("typescript-eslint does not support TS 7.0"). Pinned to `6.0.3` instead
  — the newest release actually inside `typescript-eslint`'s supported
  peer range — after confirming via `npm view typescript-eslint
  peerDependencies` rather than trial-and-error guessing at version
  numbers.

## What you wrote yourself

Nothing in this repo was typed by a separate human hand — the whole point
of this exercise is Claude Code doing the implementation with the user
directing it. The distinction that actually matters here is between
decisions made *before* code got written versus code generated and then
checked afterwards:

- **Decided up front, then implemented**: the DB engine choice (with the
  research to back it), the row-lock shape of `create_hold`/`confirm_hold`
  and why it's race-safe, which table gets which RLS policy and why
  (e.g. booking/hold having zero direct write policies at all, venue
  staying fully private behind `SECURITY DEFINER` functions rather than
  opened up), the money rounding rules, and the FRG-118 acceptance
  criteria. This is where the actual engineering judgment lived — a
  fluent-sounding wrong answer here (a permissive RLS policy, a lock
  taken in the wrong order, a rounding rule that doesn't match a fee
  cap) would have been much harder to catch after the fact than before.
- **Generated more loosely, then checked**: most of the UI (`app/`), the
  CRUD wrappers in `lib/db`, the form-handling plumbing. Faster to write
  first and verify (typecheck, lint, tests, then an actual browser) than
  to spec every prop and handler in advance.

## Honest verdict

Effectively all of the code by volume came from Claude Code; what made it
trustworthy wasn't the generation, it was that almost nothing shipped
without a specific check behind it: 46 passing tests including two that
fire genuinely concurrent Postgres connections, a live browser pass
through every page and both organiser accounts, and three real bugs
(two RLS, one Zod validation) caught by those checks rather than by
reading the diff and feeling confident.

Where it sped things up: scaffolding the whole Next.js/Tailwind/Vitest
toolchain and getting version conflicts (ESLint 10 vs `eslint-plugin-
react`, TypeScript 7 vs `typescript-eslint`) resolved quickly by checking
actual peer-dependency ranges instead of guessing; writing the large
amount of mostly-mechanical UI and CRUD code once the underlying schema
and domain functions were solid.

Where it slowed things down, or would have without checking: the pglite
detour (caught before it cost anything, by research rather than a failed
test) and the two RLS policy bugs (caught by tests, but only because
those tests existed — a plausible-looking policy read exactly as correct
as a correct one until something actually ran a query against it).

Also worth naming honestly: a chunk of wall-clock time went into fighting
this specific sandboxed Windows environment rather than the app itself —
a stale shared-memory segment from an earlier killed Postgres process
made a later `db:reset` fail outright ("pre-existing shared memory block
is still in use"), and the same long-lived dev Postgres instance became
unreliable under concurrent connections after enough ad-hoc scripts had
poked at it, while a fresh instance was rock solid every single time
(42-46 passing tests, repeatedly). That's an environment-hygiene lesson
(don't leave one embedded-postgres instance running indefinitely across
a long debugging session; kill and restart clean when something gets
weird) rather than anything wrong with the app's own code, and it's
recorded here rather than silently worked around, per the standing
instruction to say when Claude Code (or the environment) was confidently
wrong rather than just quietly retrying until it worked.

What I'd do differently with another hour: a payment step before
`confirm_hold`, a non-superuser login role for the app pool (see
`SOLUTION.md`), and Playwright coverage of the hold-expiry countdown
actually reaching zero in a real browser tick, which right now is only
proven at the domain-function level (`lib/domain/availability.test.ts`)
and by watching it happen once manually, not by an automated end-to-end
test.
