import { Pool, type PoolClient } from 'pg';

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set (see scripts/db-reset.ts / lib/test/global-setup.ts)');
  }
  return url;
}

let pool: Pool | undefined;

/** Lazy so importing this module doesn't require DATABASE_URL at import time (e.g. in tests that set it later). */
function getPool(): Pool {
  pool ??= new Pool({ connectionString: requireDatabaseUrl() });
  return pool;
}

export type RlsRole = 'anon' | 'authenticated';

export interface RlsClaims {
  organiser_id?: string;
  session_ref?: string;
}

/**
 * The only way lib/db touches show/booking/hold. Switches Postgres's
 * current role and sets request.jwt.claims for a single transaction via
 * SET LOCAL, so neither can leak onto a later, unrelated query when the
 * pool hands the underlying connection to a different caller -- a bare
 * session-level `SET ROLE` would not reset itself and could leave a later
 * request running with someone else's role/claims. This is the actual
 * defense CLAUDE.md non-negotiable #"even if an API route forgets to
 * filter" depends on: the pool's login role is a superuser (needed for
 * migrations), so every read/write in lib/db routes through here to make
 * sure RLS is genuinely evaluated rather than bypassed as owner. It
 * mirrors how PostgREST itself enforces RLS from one administrative
 * connection.
 */
export async function withRls<T>(
  role: RlsRole,
  claims: RlsClaims | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    // `role` only ever comes from the RlsRole union in this file's own
    // callers, never from request input, so this interpolation is safe.
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims ?? {}),
    ]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
