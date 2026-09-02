/**
 * Deterministic finance domain service (.claude/rules/finance-rules.md). No AI in any
 * arithmetic path; every function takes `now`/`timezone` explicitly instead of calling
 * Date.now() internally, so the same inputs always produce the same output.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import * as financialRepository from '../../repositories/financial-repository';
import type { FinancialInstanceRecord, FinancialObligationRecord } from '../../types/financial';
import type { IntentArgs } from '../../types/intents';
import { computeDueDateForPeriod, localDateString, localPeriodString } from './period';
import { fromMinorUnits, sumMinorUnits } from './money';

export interface CreateObligationResult {
  obligation: FinancialObligationRecord;
  instance: FinancialInstanceRecord;
}

export async function createObligation(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'create_financial_obligation'>,
  now: Date,
  timezone: string,
): Promise<CreateObligationResult> {
  const commitment = await commitmentsRepository.createCommitment(client, {
    userId,
    type: 'PAYMENT',
    title: args.accountName,
    description: args.obligationType,
    recurrenceRule: args.recurrenceRule,
    source: 'chat',
  });

  const obligation = await financialRepository.createObligation(client, {
    userId,
    commitmentId: commitment.id,
    accountName: args.accountName,
    obligationType: args.obligationType,
    amount: args.amount,
    currency: args.currency,
    dueDay: args.dueDay,
    recurrenceRule: args.recurrenceRule,
  });

  const period = localPeriodString(now, timezone);
  const instance = await financialRepository.getOrCreateInstanceForPeriod(client, {
    userId,
    obligationId: obligation.id,
    period,
    expectedAmount: args.amount,
  });

  return { obligation, instance };
}

export type ResolveObligationResult =
  | { status: 'ok'; obligation: FinancialObligationRecord }
  | { status: 'ambiguous'; candidates: FinancialObligationRecord[] }
  | { status: 'not_found' };

async function resolveObligation(
  client: SupabaseClient,
  userId: string,
  params: { obligationId?: string; accountName?: string },
): Promise<ResolveObligationResult> {
  if (params.obligationId) {
    const all = await financialRepository.listObligations(client, userId);
    const obligation = all.find((o) => o.id === params.obligationId);
    return obligation ? { status: 'ok', obligation } : { status: 'not_found' };
  }

  const candidates = await financialRepository.findObligationsByAccountName(
    client,
    userId,
    params.accountName!,
  );
  if (candidates.length === 0) return { status: 'not_found' };
  if (candidates.length > 1) return { status: 'ambiguous', candidates };
  return { status: 'ok', obligation: candidates[0]! };
}

export type MarkPaidResult =
  | { status: 'ambiguous'; candidates: FinancialObligationRecord[] }
  | { status: 'not_found' }
  | { status: 'unchanged'; instance: FinancialInstanceRecord }
  | { status: 'updated'; instance: FinancialInstanceRecord; wasCorrection: boolean };

export interface PaidUpdateDecision {
  action: 'noop' | 'update';
  status: 'paid' | 'partial';
  wasCorrection: boolean;
}

/**
 * The idempotency rule itself (finance-rules.md § Idempotency), as a pure function so
 * it's directly testable without a database: marking an already-paid instance with the
 * same amount and date is a no-op; a different amount/date is a correction, not a
 * duplicate.
 */
export function decidePaidUpdate(
  instance: Pick<FinancialInstanceRecord, 'status' | 'paidAmount' | 'paidDate' | 'expectedAmount'>,
  amount: string | number,
  paidDate: string,
): PaidUpdateDecision {
  const alreadyPaidSame =
    instance.status === 'paid' &&
    instance.paidAmount !== null &&
    toComparableAmount(instance.paidAmount) === toComparableAmount(amount) &&
    instance.paidDate === paidDate;

  const wasCorrection = instance.status === 'paid' || instance.status === 'partial';
  const status = toComparableAmount(amount) < toComparableAmount(instance.expectedAmount) ? 'partial' : 'paid';

  return alreadyPaidSame ? { action: 'noop', status, wasCorrection: false } : { action: 'update', status, wasCorrection };
}

export async function markPaid(
  client: SupabaseClient,
  userId: string,
  args: IntentArgs<'mark_paid'>,
  now: Date,
  timezone: string,
): Promise<MarkPaidResult> {
  const resolved = await resolveObligation(client, userId, args);
  if (resolved.status !== 'ok') return resolved;
  const { obligation } = resolved;

  const period = args.period ?? localPeriodString(now, timezone);
  const instance = await financialRepository.getOrCreateInstanceForPeriod(client, {
    userId,
    obligationId: obligation.id,
    period,
    expectedAmount: Number(obligation.amount),
  });

  const amount = args.amount ?? Number(obligation.amount);
  const paidDate = args.paidDate ?? localDateString(now, timezone);
  const decision = decidePaidUpdate(instance, amount, paidDate);

  if (decision.action === 'noop') return { status: 'unchanged', instance };

  const updated = await financialRepository.updateInstancePaidState(client, userId, instance.id, {
    status: decision.status,
    paidAmount: amount,
    paidDate,
  });

  return { status: 'updated', instance: updated, wasCorrection: decision.wasCorrection };
}

function toComparableAmount(amount: string | number): string {
  return fromMinorUnits(sumMinorUnits([amount]));
}

export interface UpcomingPayment {
  obligation: FinancialObligationRecord;
  instance: FinancialInstanceRecord;
  dueDate: string;
  /** Computed for display only — never persisted by this read path. */
  isOverdue: boolean;
}

export async function listUpcomingPayments(
  client: SupabaseClient,
  userId: string,
  now: Date,
  timezone: string,
  withinDays?: number,
): Promise<UpcomingPayment[]> {
  const obligations = await financialRepository.listObligations(client, userId);
  const period = localPeriodString(now, timezone);
  const today = localDateString(now, timezone);

  const results: UpcomingPayment[] = [];
  for (const obligation of obligations) {
    const instance = await financialRepository.getOrCreateInstanceForPeriod(client, {
      userId,
      obligationId: obligation.id,
      period,
      expectedAmount: Number(obligation.amount),
    });
    if (instance.status === 'paid' || instance.status === 'skipped') continue;

    const dueDate = computeDueDateForPeriod(period, obligation.dueDay);
    results.push({ obligation, instance, dueDate, isOverdue: dueDate < today });
  }

  const withinLimit = withinDays
    ? results.filter((r) => r.dueDate <= addDaysToDateString(today, withinDays))
    : results;

  return withinLimit.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface MonthlyRequirementBreakdown {
  currency: string;
  totalMinorUnits: string;
  totalFormatted: string;
  count: number;
}

export interface MonthlyRequirementResult {
  period: string;
  breakdown: MonthlyRequirementBreakdown[];
}

/**
 * Sum of expected_amount across this period's instances, grouped by currency
 * (finance-rules.md: "never mix currencies in a total"). Derived from instances, not
 * obligations, so a skipped/amended instance is reflected correctly.
 */
export async function calculateMonthlyRequirement(
  client: SupabaseClient,
  userId: string,
  now: Date,
  timezone: string,
  period?: string,
): Promise<MonthlyRequirementResult> {
  const resolvedPeriod = period ?? localPeriodString(now, timezone);
  const obligations = await financialRepository.listObligations(client, userId);

  const byCurrency = new Map<string, { amounts: string[]; count: number }>();
  for (const obligation of obligations) {
    const instance = await financialRepository.getOrCreateInstanceForPeriod(client, {
      userId,
      obligationId: obligation.id,
      period: resolvedPeriod,
      expectedAmount: Number(obligation.amount),
    });
    const bucket = byCurrency.get(obligation.currency) ?? { amounts: [], count: 0 };
    bucket.amounts.push(instance.expectedAmount);
    bucket.count += 1;
    byCurrency.set(obligation.currency, bucket);
  }

  const breakdown: MonthlyRequirementBreakdown[] = Array.from(byCurrency.entries()).map(
    ([currency, bucket]) => {
      const totalMinorUnits = sumMinorUnits(bucket.amounts);
      return {
        currency,
        totalMinorUnits: totalMinorUnits.toString(),
        totalFormatted: fromMinorUnits(totalMinorUnits),
        count: bucket.count,
      };
    },
  );

  return { period: resolvedPeriod, breakdown };
}
