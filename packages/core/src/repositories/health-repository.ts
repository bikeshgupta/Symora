/**
 * Reachability probes for the tables a request depends on.
 *
 * This is in the repository layer because that is where queries live (CLAUDE.md:
 * "repositories own every query"), even when the query exists to answer a question about
 * the database rather than to fetch anything from it. It reads no rows and returns no
 * data — only whether each table answered.
 *
 * `audit_events` is deliberately not in the list. It is append-only, and the guard that
 * enforces that (audit-repository.test.ts) works by refusing any query to it outside its
 * own repository. A diagnostic is not a good enough reason to punch a hole in that rule,
 * and the table ships in the same migration series as the rest — if these answer, it was
 * applied too.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const PROBED_TABLES = [
  'users',
  'conversations',
  'messages',
  'commitments',
  'financial_obligations',
  'financial_instances',
  'memories',
  'notifications',
  'ai_usage_events',
] as const;

export interface TableProbe {
  table: string;
  /** True when the table answered. False means it is missing or misconfigured. */
  answered: boolean;
  /** The driver's own words, for the server log only — never for a response. */
  detail?: string;
}

export interface ProbeResult {
  probes: TableProbe[];
  /**
   * Set when the driver never got a reply at all — a paused project, a wrong URL, a
   * request that timed out. Distinct from a table answering with an error, which is a
   * schema problem rather than a connectivity one.
   */
  unreachable: { detail: string } | null;
}

export async function probeTables(client: SupabaseClient): Promise<ProbeResult> {
  const probes: TableProbe[] = [];

  for (const table of PROBED_TABLES) {
    try {
      // head + exact count asks Postgres for the row count and returns no rows, so a
      // probe cannot become an accidental read of somebody's data.
      const { error } = await client.from(table).select('*', { count: 'exact', head: true }).limit(1);
      probes.push({ table, answered: !error, detail: error?.message });
    } catch (cause) {
      return {
        probes,
        unreachable: { detail: cause instanceof Error ? cause.message : String(cause) },
      };
    }
  }

  return { probes, unreachable: null };
}
