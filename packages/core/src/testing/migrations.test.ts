/**
 * Phase 9 — RLS and migration hygiene.
 *
 * .claude/rules/auth-security.md § Row Level Security is a set of claims about the SQL:
 * RLS is enabled on every user-owned table, no exceptions; policies scope select,
 * insert, update and delete separately; a permissive `using (true)` policy is never
 * acceptable; and a table's policy ships in the same migration that creates it, so a
 * table cannot exist unprotected even briefly.
 *
 * Those claims are checkable without a database, and left unchecked they rot: the next
 * table someone adds is the one that ships without a policy. This reads the migrations
 * and holds them to it.
 */

import { describe, expect, it } from 'vitest';
import { loadMigrations } from './migrations';
import { SCHEMA } from './schema';

const migrations = loadMigrations();
const COMMANDS = ['select', 'insert', 'update', 'delete'] as const;
const ROLES = ['anon', 'authenticated'] as const;

/** Every table any migration creates. `users` included — it is user-owned by definition. */
const createdTables = migrations.flatMap((migration) => migration.createdTables);

describe('migrations — versioning', () => {
  it('is versioned and gap-free, and no version number is reused', () => {
    const versions = migrations.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual(versions.map((_, index) => index + 1));
  });

  it('creates each table exactly once', () => {
    expect(new Set(createdTables).size).toBe(createdTables.length);
  });

  it('is forward-only: no migration drops a table or a column', () => {
    for (const migration of migrations) {
      const sql = migration.sql.toLowerCase();
      expect(sql, `${migration.filename} drops something`).not.toMatch(/\bdrop\s+(table|column)\b/);
    }
  });
});

describe('migrations — row level security', () => {
  it('enables RLS on every table it creates, in the same migration', () => {
    for (const migration of migrations) {
      for (const table of migration.createdTables) {
        expect(
          migration.rlsEnabledTables,
          `${migration.filename} creates ${table} without enabling RLS in the same migration`,
        ).toContain(table);
      }
    }
  });

  it('gives every table a policy for each command and each client role, in that same migration', () => {
    for (const migration of migrations) {
      for (const table of migration.createdTables) {
        for (const role of ROLES) {
          for (const command of COMMANDS) {
            const match = migration.policies.find(
              (policy) => policy.table === table && policy.role === role && policy.command === command,
            );
            expect(
              match,
              `${table} has no ${role} ${command} policy in ${migration.filename}`,
            ).toBeDefined();
          }
        }
      }
    }
  });

  it('never writes a permissive policy', () => {
    for (const migration of migrations) {
      for (const policy of migration.policies) {
        for (const predicate of policy.predicates) {
          expect(
            predicate,
            `${policy.name} in ${migration.filename} is permissive`,
          ).not.toBe('true');
        }
      }
    }
  });

  it('gives every policy an explicit predicate rather than relying on the default', () => {
    for (const migration of migrations) {
      for (const policy of migration.policies) {
        expect(policy.predicates.length, `${policy.name} has no using/with check`).toBeGreaterThan(0);
      }
    }
  });

  it('scopes every policy to a client role — never to public', () => {
    for (const migration of migrations) {
      for (const policy of migration.policies) {
        expect(ROLES as readonly string[], `${policy.name} targets '${policy.role}'`).toContain(policy.role);
      }
    }
  });
});

describe('migrations — user ownership', () => {
  it('gives every table besides users a user_id that cascades from users', () => {
    for (const migration of migrations) {
      for (const table of migration.createdTables) {
        if (table === 'users') continue;
        const definition = migration.sql
          .toLowerCase()
          .slice(migration.sql.toLowerCase().indexOf(`create table if not exists public.${table}`));
        expect(definition, `${table} has no cascading user_id`).toMatch(
          /user_id uuid not null references public\.users \(id\) on delete cascade/,
        );
      }
    }
  });

  it('never lets a client supply a user_id: no migration defaults it to a request value', () => {
    for (const migration of migrations) {
      expect(migration.sql.toLowerCase()).not.toMatch(/user_id[^,]*default[^,]*current_setting/);
    }
  });
});

describe('migrations — append-only tables', () => {
  const appendOnly = Object.entries(SCHEMA)
    .filter(([, schema]) => schema.appendOnly)
    .map(([table]) => table);

  it('has at least one append-only table to check', () => {
    expect(appendOnly.length).toBeGreaterThan(0);
  });

  it('gives append-only tables no updated_at trigger', () => {
    for (const table of appendOnly) {
      for (const migration of migrations) {
        expect(migration.sql.toLowerCase()).not.toContain(`before update on public.${table}`);
      }
    }
  });
});

describe('the fake schema mirrors the migrations', () => {
  it('covers exactly the tables the migrations create', () => {
    expect(Object.keys(SCHEMA).sort()).toEqual([...createdTables].sort());
  });

  it('declares a unique constraint for every unique index and inline unique in the SQL', () => {
    const declared = new Set(
      Object.entries(SCHEMA).flatMap(([table, schema]) =>
        (schema.uniques ?? []).map((unique) => `${table}:${unique.columns.join(',')}`),
      ),
    );

    for (const migration of migrations) {
      const sql = migration.sql.toLowerCase();

      for (const match of sql.matchAll(
        /create unique index (?:if not exists )?\w+\s+on public\.(\w+)\s*\(([^)]*)\)/g,
      )) {
        const columns = match[2]!.split(',').map((column) => column.trim());
        expect(declared, `${match[1]} (${columns}) is not in testing/schema.ts`).toContain(
          `${match[1]}:${columns.join(',')}`,
        );
      }

      // Inline `unique (a, b)` inside a create table, and column-level `text not null unique`.
      for (const table of migration.createdTables) {
        const start = sql.indexOf(`create table if not exists public.${table}`);
        const body = sql.slice(start, sql.indexOf(');', start));
        for (const match of body.matchAll(/^\s*unique \(([^)]*)\)/gm)) {
          const columns = match[1]!.split(',').map((column) => column.trim());
          expect(declared, `${table} (${columns}) is not in testing/schema.ts`).toContain(
            `${table}:${columns.join(',')}`,
          );
        }
        for (const match of body.matchAll(/^\s*(\w+) [\w()]+ not null unique/gm)) {
          expect(declared, `${table} (${match[1]}) is not in testing/schema.ts`).toContain(
            `${table}:${match[1]}`,
          );
        }
      }
    }
  });
});
