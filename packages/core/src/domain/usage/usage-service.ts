/**
 * AI usage and quota (PROGRESS.md Phase 8).
 *
 * Every provider call already records an `ai_usage_events` row on the call path
 * (.claude/rules/ai-pipeline.md: "Metering is part of the call path, not an optional
 * afterthought"). This service reads those rows back and answers "how much have I used,
 * and when does it reset?".
 *
 * The allowance period is a calendar month in the user's timezone, so a reset date the
 * user sees matches the month they are living in rather than a UTC boundary.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { aiUsageRepository } from '../../repositories';
import { localDateString, localPeriodString } from '../finance/period';
import type { UsageTotals } from '../../repositories/ai-usage-repository';

export interface UsageSummary {
  period: string;
  totals: UsageTotals;
  /** Null when no allowance is configured — unlimited rather than zero. */
  allowance: number | null;
  remaining: number | null;
  /** First day of next month in the user's timezone. */
  resetsOn: string;
  /** True once the allowance is spent; the caller decides what to do about it. */
  exhausted: boolean;
  /** Offline deployments make no provider calls, so usage stays at zero by design. */
  aiMode: 'ai' | 'offline';
}

function firstOfNextMonth(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const nextMonth = month! === 12 ? 1 : month! + 1;
  const nextYear = month! === 12 ? year! + 1 : year!;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

function readAllowance(env: NodeJS.ProcessEnv): number | null {
  const raw = env.AI_MONTHLY_REQUEST_ALLOWANCE;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

export async function getUsage(
  client: SupabaseClient,
  userId: string,
  now: Date,
  timezone: string,
  aiMode: 'ai' | 'offline',
  env: NodeJS.ProcessEnv = process.env,
): Promise<UsageSummary> {
  const period = localPeriodString(now, timezone);

  // The start of this month at local midnight, expressed as an instant for the query.
  // Compared against created_at, which is timestamptz in UTC.
  const monthStartLocalDate = `${period}-01`;
  const sinceIso = new Date(`${monthStartLocalDate}T00:00:00Z`).toISOString();

  const totals = await aiUsageRepository.getUsageSince(client, userId, sinceIso);
  const allowance = readAllowance(env);

  return {
    period,
    totals,
    allowance,
    remaining: allowance === null ? null : Math.max(0, allowance - totals.requests),
    resetsOn: firstOfNextMonth(period),
    exhausted: allowance !== null && totals.requests >= allowance,
    aiMode,
  };
}

/** Today in the user's timezone — exposed so the API layer needs one import. */
export { localDateString as todayIn };
