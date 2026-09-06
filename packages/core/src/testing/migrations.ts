/**
 * A small reader for `supabase/migrations/`. TEST-ONLY.
 *
 * The RLS rules in .claude/rules/auth-security.md are properties of the SQL, so the
 * only honest way to test them without a live database is to read the SQL. This parses
 * just enough of it — create table, enable row level security, create policy — for
 * `migrations.test.ts` to assert against.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, '..', '..', '..', '..', 'supabase', 'migrations');

export interface Policy {
  name: string;
  table: string;
  command: 'select' | 'insert' | 'update' | 'delete' | 'all';
  role: string;
  /** The predicate text of `using (...)` / `with check (...)`, lowercased. */
  predicates: string[];
}

export interface Migration {
  filename: string;
  version: number;
  sql: string;
  createdTables: string[];
  rlsEnabledTables: string[];
  policies: Policy[];
}

/** Comments carry the reasoning for these policies; they must not be parsed as SQL. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function parse(filename: string, sql: string): Migration {
  const body = stripComments(sql).toLowerCase();

  const createdTables = [...body.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map(
    (match) => match[1]!,
  );
  const rlsEnabledTables = [...body.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map(
    (match) => match[1]!,
  );

  const policies: Policy[] = [];
  const policyPattern =
    /create policy (\w+)\s+on public\.(\w+)\s+for (select|insert|update|delete|all)\s+to (\w+)\s*([^;]*);/g;
  for (const match of body.matchAll(policyPattern)) {
    const predicates = [...match[5]!.matchAll(/(?:using|with check)\s*\(([^)]*)\)/g)].map((p) =>
      p[1]!.trim(),
    );
    policies.push({
      name: match[1]!,
      table: match[2]!,
      command: match[3] as Policy['command'],
      role: match[4]!,
      predicates,
    });
  }

  const version = Number(filename.slice(0, 4));
  return { filename, version, sql, createdTables, rlsEnabledTables, policies };
}

export function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith('.sql'))
    .sort()
    .map((filename) => parse(filename, readFileSync(join(MIGRATIONS_DIR, filename), 'utf8')));
}
