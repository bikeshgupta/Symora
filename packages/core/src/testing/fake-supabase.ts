/**
 * An in-memory stand-in for the Supabase client, good enough to run the real
 * repositories against.
 *
 * TEST-ONLY (Phase 9). Not exported from the package index.
 *
 * Why this exists: every user-isolation, idempotency and deletion rule in
 * .claude/rules/auth-security.md and .claude/rules/finance-rules.md is enforced by
 * repository queries and database constraints, and neither can be tested by mocking the
 * repositories — a mock would simply agree with whatever the caller expects. This
 * implements the slice of PostgREST the repositories actually use, backed by real row
 * storage with real unique constraints and real cascade deletes, so a query that
 * forgets `.eq('user_id', ...)` genuinely returns another user's row and the test
 * genuinely fails.
 *
 * What it deliberately does NOT do: RLS. RLS is a property of the SQL policies, and the
 * service-role client bypasses it in production anyway; `rls-policies.test.ts` audits
 * the migrations for that instead.
 */

import { randomUUID } from 'node:crypto';
import { SCHEMA, type TableSchema } from './schema';

export type Row = Record<string, unknown>;

interface PostgrestErrorLike {
  code: string;
  message: string;
  details: string;
  hint: string;
}

interface Result<T> {
  data: T;
  error: PostgrestErrorLike | null;
  count: number | null;
  status: number;
  statusText: string;
}

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'ilike' | 'like';

interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
}

/** A parsed `.or('a.is.null,b.gt.2026-01-01')` — any branch matching is enough. */
interface OrFilter {
  branches: Filter[];
}

type AnyFilter = { kind: 'simple'; filter: Filter } | { kind: 'or'; filter: OrFilter };

interface OrderSpec {
  column: string;
  ascending: boolean;
  nullsFirst: boolean;
}

// ---------------------------------------------------------------------------
// Value comparison
// ---------------------------------------------------------------------------

/**
 * PostgREST compares against text sent in the query string, so a numeric column stored
 * as '42500.00' still matches `eq('amount', 42500)`. Normalising both sides the same way
 * keeps the fake from being stricter than the real thing.
 */
function normalize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function compare(a: unknown, b: unknown): number {
  const left = normalize(a);
  const right = normalize(b);
  if (left === null || right === null) return NaN;

  const asNumbers = Number(left);
  const asNumbersRight = Number(right);
  if (left.trim() !== '' && right.trim() !== '' && !Number.isNaN(asNumbers) && !Number.isNaN(asNumbersRight)) {
    return asNumbers - asNumbersRight;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function likeToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, caseInsensitive ? 'i' : '');
}

function matchesFilter(row: Row, filter: Filter): boolean {
  const actual = row[filter.column];

  switch (filter.op) {
    case 'eq':
      return normalize(actual) !== null && normalize(actual) === normalize(filter.value);
    case 'neq':
      // Postgres: NULL <> 'x' is NULL, which filters the row out.
      return normalize(actual) !== null && normalize(actual) !== normalize(filter.value);
    case 'gt':
      return compare(actual, filter.value) > 0;
    case 'gte':
      return compare(actual, filter.value) >= 0;
    case 'lt':
      return compare(actual, filter.value) < 0;
    case 'lte':
      return compare(actual, filter.value) <= 0;
    case 'in':
      return (
        Array.isArray(filter.value) &&
        filter.value.some((candidate) => normalize(actual) === normalize(candidate))
      );
    case 'is':
      if (filter.value === null) return actual === null || actual === undefined;
      return normalize(actual) === normalize(filter.value);
    case 'ilike':
      return actual !== null && actual !== undefined && likeToRegExp(String(filter.value), true).test(String(actual));
    case 'like':
      return actual !== null && actual !== undefined && likeToRegExp(String(filter.value), false).test(String(actual));
    default: {
      const exhaustive: never = filter.op;
      throw new Error(`Unsupported filter op ${String(exhaustive)}`);
    }
  }
}

/** `col.op.value` — the PostgREST syntax `.or()` takes. */
function parseOrBranch(expression: string): Filter {
  const [column, op, ...rest] = expression.split('.');
  if (!column || !op) throw new Error(`Malformed .or() branch: '${expression}'`);
  const raw = rest.join('.');
  const value = op === 'is' && raw === 'null' ? null : raw;
  return { column, op: op as FilterOp, value };
}

// ---------------------------------------------------------------------------
// The database
// ---------------------------------------------------------------------------

export class FakeDatabase {
  private readonly tables = new Map<string, Row[]>();
  /** Tables made to fail, so a dropped connection can be provoked deliberately. */
  private readonly failures = new Map<string, string>();
  /**
   * A monotonic clock for created_at/updated_at. Real timestamps collide inside a
   * millisecond, which makes any ordered assertion flaky; this makes insertion order
   * total and reproducible.
   */
  private tick = 0;
  private readonly epoch: number;

  constructor(epochIso = '2026-01-01T00:00:00.000Z') {
    this.epoch = Date.parse(epochIso);
    for (const table of Object.keys(SCHEMA)) this.tables.set(table, []);
  }

  private nextTimestamp(): string {
    this.tick += 1;
    return new Date(this.epoch + this.tick).toISOString();
  }

  schemaFor(table: string): TableSchema {
    const schema = SCHEMA[table];
    if (!schema) throw new Error(`Unknown table '${table}'. Add it to testing/schema.ts.`);
    return schema;
  }

  /**
   * Makes every query against a table fail the way a dropped connection does.
   *
   * The failure modes worth testing are the ones nobody sees in development, and "the
   * database went away mid-request" is the first of them. Injected here rather than by
   * monkey-patching a row array so it reaches reads and writes alike, and so the error
   * arrives through the same `{ data, error }` channel a real driver failure would.
   */
  failTable(table: string, message = 'connect ECONNREFUSED 10.0.0.5:5432 (db.example.supabase.co)'): void {
    this.schemaFor(table);
    this.failures.set(table, message);
  }

  failureFor(table: string): PostgrestErrorLike | null {
    const message = this.failures.get(table);
    return message ? { code: '08006', message, details: '', hint: '' } : null;
  }

  /** Direct row access, for seeding a fixture and for asserting on what a write left behind. */
  rows(table: string): Row[] {
    this.schemaFor(table);
    return this.tables.get(table)!;
  }

  /** Total rows across every table — how "deleting the account left nothing" is asserted. */
  countAll(): number {
    let total = 0;
    for (const rows of this.tables.values()) total += rows.length;
    return total;
  }

  applyDefaults(table: string, values: Row): Row {
    const schema = this.schemaFor(table);
    const row: Row = { ...schema.defaults, ...values };

    for (const column of schema.generated) {
      if (row[column] !== undefined) continue;
      row[column] = column === 'id' ? randomUUID() : this.nextTimestamp();
    }
    for (const column of schema.numericColumns ?? []) {
      // PostgREST returns numeric as a string; store it that way so a test can never
      // pass on a number the repositories would never actually receive.
      if (typeof row[column] === 'number') row[column] = String(row[column]);
    }
    return row;
  }

  touch(table: string, row: Row): void {
    if (this.schemaFor(table).generated.includes('updated_at')) {
      row.updated_at = this.nextTimestamp();
    }
  }

  /**
   * The unique constraints from the migrations. Returning a 23505 the way Postgres does
   * is what lets getOrCreateInstanceForPeriod's race branch be exercised for real.
   */
  checkUnique(table: string, candidate: Row, ignoreRow?: Row): PostgrestErrorLike | null {
    const schema = this.schemaFor(table);
    for (const constraint of schema.uniques ?? []) {
      if (constraint.where && !constraint.where(candidate)) continue;

      const clash = this.rows(table).some((row) => {
        if (row === ignoreRow) return false;
        if (constraint.where && !constraint.where(row)) return false;
        return constraint.columns.every((column) => normalize(row[column]) === normalize(candidate[column]));
      });

      if (clash) {
        return {
          code: '23505',
          message: `duplicate key value violates unique constraint "${constraint.name}"`,
          details: `Key (${constraint.columns.join(', ')}) already exists.`,
          hint: '',
        };
      }
    }
    return null;
  }

  /** `on delete cascade` from users, plus the chains that hang off commitments/instances. */
  cascadeDelete(table: string, deleted: Row[]): void {
    if (table === 'users') {
      const userIds = new Set(deleted.map((row) => String(row.id)));
      for (const [name, schema] of Object.entries(SCHEMA)) {
        if (!schema.cascadeOnUserDelete) continue;
        this.tables.set(
          name,
          this.rows(name).filter((row) => !userIds.has(String(row.user_id))),
        );
      }
      return;
    }

    if (table === 'commitments') {
      const ids = new Set(deleted.map((row) => String(row.id)));
      const obligations = this.rows('financial_obligations').filter((row) => ids.has(String(row.commitment_id)));
      this.tables.set(
        'financial_obligations',
        this.rows('financial_obligations').filter((row) => !ids.has(String(row.commitment_id))),
      );
      this.tables.set(
        'notifications',
        this.rows('notifications').filter((row) => !ids.has(String(row.commitment_id))),
      );
      this.cascadeDelete('financial_obligations', obligations);
      return;
    }

    if (table === 'financial_obligations') {
      const ids = new Set(deleted.map((row) => String(row.id)));
      const instances = this.rows('financial_instances').filter((row) => ids.has(String(row.obligation_id)));
      this.tables.set(
        'financial_instances',
        this.rows('financial_instances').filter((row) => !ids.has(String(row.obligation_id))),
      );
      this.cascadeDelete('financial_instances', instances);
      return;
    }

    if (table === 'financial_instances') {
      const ids = new Set(deleted.map((row) => String(row.id)));
      this.tables.set(
        'notifications',
        this.rows('notifications').filter((row) => !ids.has(String(row.instance_id))),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The query builder
// ---------------------------------------------------------------------------

type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

interface UpsertOptions {
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

class FakeQuery<T> implements PromiseLike<Result<T>> {
  private mode: Mode = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private upsertOptions: UpsertOptions = {};
  private readonly filters: AnyFilter[] = [];
  private readonly orders: OrderSpec[] = [];
  private limitCount: number | null = null;
  private projection: string[] | null = null;
  private returnsRows = false;
  private wantsCount = false;
  private headOnly = false;
  private cardinality: 'many' | 'single' | 'maybeSingle' = 'many';

  constructor(
    private readonly db: FakeDatabase,
    private readonly table: string,
  ) {}

  // -- verbs ---------------------------------------------------------------

  select(columns?: string, options?: { count?: string; head?: boolean }): this {
    // On a write, .select() only asks for the affected rows back; it is not a read.
    if (this.mode === 'select') this.returnsRows = true;
    else this.returnsRows = true;

    if (columns && columns.trim() !== '' && columns.trim() !== '*') {
      this.projection = columns.split(',').map((column) => column.trim());
    }
    if (options?.count) this.wantsCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(values: Row | Row[]): this {
    this.mode = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    this.returnsRows = false;
    return this;
  }

  upsert(values: Row | Row[], options: UpsertOptions = {}): this {
    this.mode = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    this.upsertOptions = options;
    this.returnsRows = false;
    return this;
  }

  update(patch: Row): this {
    this.mode = 'update';
    this.patch = patch;
    this.returnsRows = false;
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    this.returnsRows = false;
    return this;
  }

  // -- filters -------------------------------------------------------------

  private addFilter(column: string, op: FilterOp, value: unknown): this {
    this.filters.push({ kind: 'simple', filter: { column, op, value } });
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.addFilter(column, 'eq', value);
  }
  neq(column: string, value: unknown): this {
    return this.addFilter(column, 'neq', value);
  }
  gt(column: string, value: unknown): this {
    return this.addFilter(column, 'gt', value);
  }
  gte(column: string, value: unknown): this {
    return this.addFilter(column, 'gte', value);
  }
  lt(column: string, value: unknown): this {
    return this.addFilter(column, 'lt', value);
  }
  lte(column: string, value: unknown): this {
    return this.addFilter(column, 'lte', value);
  }
  in(column: string, values: unknown[]): this {
    return this.addFilter(column, 'in', values);
  }
  is(column: string, value: unknown): this {
    return this.addFilter(column, 'is', value);
  }
  ilike(column: string, pattern: string): this {
    return this.addFilter(column, 'ilike', pattern);
  }
  like(column: string, pattern: string): this {
    return this.addFilter(column, 'like', pattern);
  }

  or(expression: string): this {
    this.filters.push({
      kind: 'or',
      filter: { branches: expression.split(',').map(parseOrBranch) },
    });
    return this;
  }

  // -- shaping -------------------------------------------------------------

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}): this {
    const ascending = options.ascending ?? true;
    this.orders.push({
      column,
      ascending,
      // Postgres default: nulls last ascending, nulls first descending.
      nullsFirst: options.nullsFirst ?? !ascending,
    });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.cardinality = 'single';
    this.returnsRows = true;
    return this;
  }

  maybeSingle(): this {
    this.cardinality = 'maybeSingle';
    this.returnsRows = true;
    return this;
  }

  returns<R>(): FakeQuery<R> {
    return this as unknown as FakeQuery<R>;
  }

  // -- execution -----------------------------------------------------------

  private matches(row: Row): boolean {
    return this.filters.every((entry) =>
      entry.kind === 'simple'
        ? matchesFilter(row, entry.filter)
        : entry.filter.branches.some((branch) => matchesFilter(row, branch)),
    );
  }

  private sort(rows: Row[]): Row[] {
    if (this.orders.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const spec of this.orders) {
        const aNull = a[spec.column] === null || a[spec.column] === undefined;
        const bNull = b[spec.column] === null || b[spec.column] === undefined;
        if (aNull || bNull) {
          if (aNull && bNull) continue;
          return aNull === spec.nullsFirst ? -1 : 1;
        }
        const delta = compare(a[spec.column], b[spec.column]);
        if (delta !== 0) return spec.ascending ? delta : -delta;
      }
      return 0;
    });
  }

  private project(rows: Row[]): Row[] {
    if (!this.projection) return rows.map((row) => ({ ...row }));
    return rows.map((row) => {
      const projected: Row = {};
      for (const column of this.projection!) projected[column] = row[column];
      return projected;
    });
  }

  private conflictColumns(): string[] {
    const declared = this.upsertOptions.onConflict;
    if (declared) return declared.split(',').map((column) => column.trim());
    const first = this.db.schemaFor(this.table).uniques?.[0];
    if (!first) throw new Error(`upsert on '${this.table}' needs an onConflict target.`);
    return first.columns;
  }

  private run(): Result<T> {
    const table = this.table;
    const injected = this.db.failureFor(table);
    if (injected) return this.fail(injected);

    const all = this.db.rows(table);
    const schema = this.db.schemaFor(table);

    if (schema.appendOnly && (this.mode === 'update' || this.mode === 'delete')) {
      return this.fail({
        code: '42501',
        message: `${table} is append-only`,
        details: '',
        hint: '',
      });
    }

    let affected: Row[] = [];

    switch (this.mode) {
      case 'select': {
        const matched = all.filter((row) => this.matches(row));
        const sorted = this.sort(matched);
        const limited = this.limitCount === null ? sorted : sorted.slice(0, this.limitCount);
        if (this.headOnly) {
          return {
            data: null as T,
            error: null,
            count: matched.length,
            status: 200,
            statusText: 'OK',
          };
        }
        return this.shape(limited, this.wantsCount ? matched.length : null);
      }

      case 'insert': {
        const prepared: Row[] = [];
        for (const values of this.payload) {
          const row = this.db.applyDefaults(table, values);
          const violation = this.db.checkUnique(table, row);
          if (violation) return this.fail(violation);
          // Staged first so a multi-row insert is all-or-nothing, as a statement is.
          prepared.push(row);
        }
        all.push(...prepared);
        affected = prepared;
        break;
      }

      case 'upsert': {
        const conflict = this.conflictColumns();
        for (const values of this.payload) {
          const existing = all.find((row) =>
            conflict.every((column) => normalize(row[column]) === normalize(values[column])),
          );

          if (existing) {
            // ignoreDuplicates leaves the stored row exactly as it is — regeneration
            // must never resurrect something the user already dismissed.
            if (this.upsertOptions.ignoreDuplicates) continue;
            Object.assign(existing, values);
            this.db.touch(table, existing);
            affected.push(existing);
            continue;
          }

          const row = this.db.applyDefaults(table, values);
          const violation = this.db.checkUnique(table, row);
          if (violation) return this.fail(violation);
          all.push(row);
          affected.push(row);
        }
        break;
      }

      case 'update': {
        const matched = all.filter((row) => this.matches(row));
        for (const row of matched) {
          const candidate = { ...row, ...this.patch };
          const violation = this.db.checkUnique(table, candidate, row);
          if (violation) return this.fail(violation);
        }
        for (const row of matched) {
          Object.assign(row, this.patch);
          for (const column of schema.numericColumns ?? []) {
            if (typeof row[column] === 'number') row[column] = String(row[column]);
          }
          this.db.touch(table, row);
        }
        affected = matched;
        break;
      }

      case 'delete': {
        const matched = all.filter((row) => this.matches(row));
        const survivors = all.filter((row) => !matched.includes(row));
        all.length = 0;
        all.push(...survivors);
        this.db.cascadeDelete(table, matched);
        affected = matched;
        break;
      }
    }

    return this.shape(this.sort(affected), null);
  }

  private shape(rows: Row[], count: number | null): Result<T> {
    if (!this.returnsRows) {
      return { data: null as T, error: null, count, status: 200, statusText: 'OK' };
    }

    const projected = this.project(rows);

    if (this.cardinality === 'many') {
      return { data: projected as T, error: null, count, status: 200, statusText: 'OK' };
    }

    if (projected.length > 1) {
      return this.fail({
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        details: `Results contain ${projected.length} rows`,
        hint: '',
      });
    }

    if (projected.length === 0) {
      if (this.cardinality === 'maybeSingle') {
        return { data: null as T, error: null, count, status: 200, statusText: 'OK' };
      }
      return this.fail({
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
        details: 'Results contain 0 rows',
        hint: '',
      });
    }

    return { data: projected[0] as T, error: null, count, status: 200, statusText: 'OK' };
  }

  private fail(error: PostgrestErrorLike): Result<T> {
    return { data: null as T, error, count: null, status: 400, statusText: 'Bad Request' };
  }

  then<TResult1 = Result<T>, TResult2 = never>(
    onfulfilled?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result: Result<T>;
    try {
      result = this.run();
    } catch (err) {
      return Promise.reject(err).then(onfulfilled as never, onrejected);
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

/**
 * A client shaped like `SupabaseClient` for the calls the repositories make. Cast at the
 * boundary because it implements a deliberate subset — anything a repository starts
 * using that is missing here fails loudly rather than silently returning undefined.
 */
export interface FakeSupabaseClient {
  from(table: string): FakeQuery<unknown>;
  db: FakeDatabase;
}

export function createFakeSupabase(db = new FakeDatabase()): FakeSupabaseClient {
  return {
    from(table: string) {
      return new FakeQuery(db, table);
    },
    db,
  };
}
