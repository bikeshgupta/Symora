/**
 * Reports which migrations in `supabase/migrations/` have not reached the live database.
 *
 * Migrations are applied by hand (`supabase db push`, or pasting into the SQL editor),
 * so the database can sit a version or two behind the repo with nothing to say so. What
 * that looks like from the app is a 500 with a generic message, one endpoint at a time,
 * long after the migration was written — `/api/notifications` returning INTERNAL_ERROR
 * because the table was never created.
 *
 * This asks the database directly. It reads the column list out of each migration and
 * requests exactly those columns through PostgREST, so a missing table and a missing
 * column are both caught. It needs only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY —
 * no database password — which is what makes it runnable in the same places the app is.
 *
 * Read-only: it issues `select ... limit 1` and nothing else.
 *
 *   npm run db:check
 */

import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';

/** Minimal .env reader — this runs outside the app, so it has no config layer to borrow. */
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (!match) continue;
      let value = match[2].trim();
      if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
        value = value.slice(1, -1);
      }
      // First file wins, matching how the tooling layers .env.local over .env.
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}

const COLUMN_TYPES = 'uuid|text|date|time|integer|bigint|numeric|boolean|timestamptz|jsonb';

/**
 * The tables and columns the migrations declare, keyed by table.
 *
 * Parsed from the SQL rather than hand-listed, so a migration added later is covered
 * without anyone remembering to update this file.
 */
function declaredSchema() {
  const schema = new Map();
  const add = (table, columns) => {
    schema.set(table, new Set([...(schema.get(table) ?? []), ...columns]));
  };

  for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith('.sql')) continue;
    // Comments are stripped first so a column name mentioned in prose is not read as one.
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');

    for (const table of sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const columns = table[2]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => new RegExp(`^\\w+\\s+(${COLUMN_TYPES})`).test(line))
        .map((line) => line.split(/\s+/)[0]);
      add(table[1], columns);
    }
    for (const altered of sql.matchAll(/alter table public\.(\w+)\s+add column if not exists (\w+)/g)) {
      add(altered[1], [altered[2]]);
    }
  }
  return schema;
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to check the schema.');
    process.exit(2);
  }

  const problems = [];
  for (const [table, columns] of declaredSchema()) {
    const select = [...columns].join(',');
    const response = await fetch(`${url}/rest/v1/${table}?select=${select}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });

    if (response.ok) {
      console.log(`  ok       ${table} (${columns.size} columns)`);
      continue;
    }
    const body = await response.text();
    let message = body;
    try {
      message = JSON.parse(body).message ?? body;
    } catch {
      // Non-JSON error body: report it as-is rather than hiding it.
    }
    problems.push(`${table}: ${message}`);
    console.log(`  MISSING  ${table} — ${message}`);
  }

  if (problems.length === 0) {
    console.log('\nSchema matches the migrations.');
    return;
  }
  console.log(
    `\n${problems.length} table(s) behind the migrations. Apply the unapplied files in ` +
      `${MIGRATIONS_DIR}/ in order — \`supabase db push\`, or paste them into the Supabase SQL editor.`,
  );
  process.exit(1);
}

await main();
