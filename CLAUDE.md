# CLAUDE.md

Project memory for this repo. This file ships with the challenge — extend it,
don't delete it. How you shape it is part of what we're assessing.

## What this is

Fringe: a ticketing app for a fringe theatre festival. Shows at small venues,
ten-minute basket holds, and inventory that several people grab at once.

## Non-negotiables

1. **A show cannot be oversold.** Confirmed bookings plus live holds must never
   exceed capacity, including under concurrent writes. Enforce it in the database
   — a constraint or a serialised transaction — not with a read-then-write in
   application code.
2. **Money is integer minor units.** Never a float. Format at the edge, never in
   the domain layer. The order total must equal the sum of its lines.
3. **All instants are `timestamptz`.** Show times render in the venue's timezone,
   not the browser's, not the server's. `timestamp without time zone` is a bug.
4. **TypeScript strict.** No `any`. No `@ts-ignore` without a comment saying what
   the trade-off is.
5. **Availability logic exists once.** The UI, the API and the concierge tool all
   read the same function.

## Layout

```
app/            Next.js App Router routes and server actions
lib/domain/     Pure domain logic: availability, expiry, pricing. No I/O.
lib/db/         Data access. The only place that talks to Postgres.
lib/tools/      Typed tools for the concierge bot. Zod in, typed out.
db/             schema.sql, policies.sql, seed.sql
scripts/        integrity-guard.ts
```

Business rules go in `lib/domain/`. If a rule is in a React component or a route
handler, it's in the wrong place.

## Commands

```
npm run dev
npm run verify     # lint + typecheck + test + integrity guard. This is the gate.
npm run test
npm run db:reset   # rebuild local schema and reseed
```

## Working agreements

- Plan before editing anything that touches more than two files.
- Tests come from acceptance criteria, not from a coverage number.
- Concurrency claims need a test that actually runs writes in parallel.
- Small commits with real messages. The history gets read.
- Before you tell a human it works, run `npm run verify`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
