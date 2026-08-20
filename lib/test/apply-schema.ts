import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';

const FILES = ['db/schema.sql', 'db/local-auth-shim.sql', 'db/functions.sql', 'db/policies.sql'];

/**
 * Applies the full schema (fresh `public` schema first) the same way it
 * would be applied against real Supabase, minus local-auth-shim.sql, which
 * only exists for this test/dev environment. Pass `seed: true` to also load
 * db/seed.sql's fixed fixtures (Last Four Seats, Mei/Darren, etc.).
 */
export async function applySchema(pool: Pool, options: { seed?: boolean } = {}): Promise<void> {
  await pool.query('drop schema if exists public cascade; create schema public;');
  for (const file of FILES) {
    await pool.query(readFileSync(file, 'utf8'));
  }
  if (options.seed) {
    await pool.query(readFileSync('db/seed.sql', 'utf8'));
  }
}
