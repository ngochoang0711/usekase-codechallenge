/**
 * Integrity guard.
 *
 * Three checks the schema has to pass before CI goes green. A slimmed-down
 * cousin of the guards that run in our own CI.
 *
 *   1. No naive timestamps. Every instant is `timestamptz`.
 *   2. Row-level security is enabled, with a policy, on every table that holds
 *      organiser or customer data.
 *   3. Oversell is prevented in the database - a constraint, an exclusion, or a
 *      trigger/function that knows about capacity. Application-level
 *      read-then-write does not count and cannot be detected here, which is
 *      exactly why we look for the database-level thing.
 *
 * Do not exempt tables to make this pass. Fix the schema.
 *
 * Usage: npm run guard
 */

import { readFileSync, existsSync } from 'node:fs';

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const schema = read('db/schema.sql');
const policies = read('db/policies.sql');
// Candidates may put constraints/triggers in their own migration files.
const extra = ['db/constraints.sql', 'db/functions.sql', 'db/migrations.sql']
  .map(read)
  .join('\n');
const all = `${schema}\n${extra}`;

const PROTECTED = ['venue', 'show', 'hold', 'booking'];

const failures: string[] = [];

// 1. naive timestamps
for (const [, table, body] of schema.matchAll(/create table (\w+)\s*\(([\s\S]*?)\n\);/g)) {
  for (const line of body.split('\n')) {
    if (/\btimestamp\b(?!tz)/.test(line) && !/timestamp\s+with time zone/.test(line)) {
      failures.push(`${table}: naive timestamp -> ${line.trim().replace(/,$/, '')}`);
    }
  }
}

// 2. row-level security
for (const table of PROTECTED) {
  if (!new RegExp(`alter table ${table} enable row level security`, 'i').test(policies)) {
    failures.push(`${table}: RLS not enabled`);
  }
  if (!new RegExp(`create policy [\\w_]+ on ${table}\\b`, 'i').test(policies)) {
    failures.push(`${table}: no RLS policy`);
  }
}

// 3. oversell protection in the database
const hasDbLevelCapacityRule =
  /exclude\s+using/i.test(all) ||
  (/create\s+(or replace\s+)?(function|trigger)/i.test(all) && /capacity/i.test(all.split(/create table show/)[1] ?? '')) ||
  /alter table (booking|hold)[\s\S]*?add constraint[\s\S]*?capacity/i.test(all);

if (!hasDbLevelCapacityRule) {
  failures.push(
    'show: nothing in the database prevents oversell. Add a constraint, an ' +
      'exclusion constraint, or a trigger/function that enforces capacity.',
  );
}

if (failures.length > 0) {
  console.error('Integrity guard failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('Integrity guard passed.');
