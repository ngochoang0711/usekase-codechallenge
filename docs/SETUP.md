# Setup

Nothing here is a trap. If you lose more than 20 minutes to environment setup,
stop, note it in `SOLUTION.md`, and work around it. We'd rather you spent the
time on the actual problem.

## Prerequisites

- Node 22+
- Docker (for local Supabase), or any Postgres 15+ you already have

## Local database

```bash
npx supabase start          # or point at your own Postgres
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/policies.sql
psql "$DATABASE_URL" -f db/seed.sql
```

Seeded organisers:

| Organiser | id | Venues |
|---|---|---|
| Mei Chen | `0a000000-0000-0000-0000-000000000001` | Black Box @ Bugis, The Attic |
| Darren Blake | `0a000000-0000-0000-0000-000000000002` | The Loft (Melbourne), Kathmandu Courtyard |

Sign in as Mei for the organiser views. If Darren's shows or bookings ever show
up under Mei, that's the thing we want you to find rather than route around.

`Last Four Seats` is the show to test against: capacity 4, two confirmed
bookings, one live hold and one expired hold that nobody has swept.

## Scripts we expect to exist

```json
{
  "dev": "next dev",
  "build": "next build",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "guard": "tsx scripts/integrity-guard.ts",
  "verify": "npm run lint && npm run typecheck && npm run test && npm run guard"
}
```

`npm run verify` is the gate. CI runs exactly that. It fails on a clean checkout,
on purpose — read what it says.
