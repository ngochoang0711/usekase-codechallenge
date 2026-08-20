/**
 * Rebuilds the local dev database from scratch and reseeds it.
 *
 * Runs a real Postgres binary (embedded-postgres, no Docker) as a
 * persistent background process on DEV_PG_PORT, wipes any previous data
 * directory, applies schema.sql -> local-auth-shim.sql -> functions.sql ->
 * policies.sql -> seed.sql in order, then leaves the server running for
 * `npm run dev` to connect to.
 *
 * Usage: npm run db:reset
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';

export const DEV_PG_PORT = 54_330;
export const DEV_DATA_DIR = join(process.cwd(), '.data', 'pg-dev');
export const DEV_DATABASE_NAME = 'fringe';
export const DEV_DATABASE_URL = `postgres://postgres:postgres@localhost:${DEV_PG_PORT}/${DEV_DATABASE_NAME}`;

const SQL_FILES = [
  'db/schema.sql',
  'db/local-auth-shim.sql',
  'db/functions.sql',
  'db/policies.sql',
  'db/seed.sql',
];

async function main(): Promise<void> {
  if (existsSync(DEV_DATA_DIR)) {
    console.log('Removing existing dev data directory...');
    const stale = new EmbeddedPostgres({
      databaseDir: DEV_DATA_DIR,
      user: 'postgres',
      password: 'postgres',
      port: DEV_PG_PORT,
      persistent: true,
    });
    await stale.stop().catch(() => undefined);
    rmSync(DEV_DATA_DIR, { recursive: true, force: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DEV_DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: DEV_PG_PORT,
    persistent: true,
  });

  console.log('Initialising Postgres...');
  await pg.initialise();
  console.log('Starting Postgres...');
  await pg.start();
  await pg.createDatabase(DEV_DATABASE_NAME);

  const pool = new Pool({ connectionString: DEV_DATABASE_URL });
  for (const file of SQL_FILES) {
    console.log(`Applying ${file}...`);
    await pool.query(readFileSync(file, 'utf8'));
  }
  await pool.end();

  console.log(`\nDone. Postgres is running at ${DEV_DATABASE_URL}`);
  console.log('Set this as DATABASE_URL (e.g. in .env.local) before `npm run dev`.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
