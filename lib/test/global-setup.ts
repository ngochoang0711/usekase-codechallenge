import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

// A real Postgres binary (no Docker, no admin rights), run as a plain child
// process for the whole test run. Chosen over @electric-sql/pglite because
// pglite serializes every query/transaction through an internal mutex, which
// makes it impossible to prove the oversell row-lock under genuine concurrent
// writes -- see the "DB engine decision" section of the implementation plan.
const PORT = 54_329;
const DATABASE_NAME = 'fringe_test';

export default async function setup(): Promise<() => Promise<void>> {
  const databaseDir = mkdtempSync(join(tmpdir(), 'fringe-pg-'));

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DATABASE_NAME);

  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DATABASE_NAME}`;

  return async () => {
    await pg.stop();
    rmSync(databaseDir, { recursive: true, force: true });
  };
}
