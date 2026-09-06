/**
 * Deterministic finance domain service (.claude/rules/finance-rules.md). No AI in any
 * arithmetic path; every function takes `now`/`timezone` explicitly instead of calling
 * Date.now() internally, so the same inputs always produce the same output.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import * as auditRepository from '../../repositories/audit-repository';
import * as commitmentsRepository from '../../repositories/commitments-repository';
import * as financialRepository from '../../repositories/financial-repository';
import type { FinancialInstanceRecord, FinancialObligationRecord } from '../../types/financial';
import type { IntentArgs } from '../../types/intents';
import { computeDueDateForPeriod, localDateString, localPeriodString } from './period';
import { fromMinorUnits, sumMinorUnits } from './money';
import {
  addMonthsToPeriod,
  deriveInstanceState,
  isOutstanding,
  missingPeriods,
  periodsBetween,
  type InstanceState,
} from './instances';

/** 'YYYY-MM' for the current month in the user's timezone. */
export function currentPeriod(now: Date, timezone: string): string {
  return localPeriodString(now, timezone);
}

export async function listObligations(
  client: SupabaseClient,
  userId: string,
): Promise<FinancialObligationRecord[]> {
  return financialRepository.listObligations(client, userId);
}

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

/**
 * finance-rules.md § Idempotency: "Marking paid with a *different* amount is a
 * correction, not a duplicate: it updates the instance and records an audit event."
 *
 * Amounts only — never a note, a title, or anything the user typed. A correction is the
 * one payment write that overwrites a value the user already saw and accepted, so what
 * it was before is worth keeping; what they said about it is not this table's business.
 */
async function auditCorrection(
  client: SupabaseClient,
  userId: string,
  before: FinancialInstanceRecord,
  after: FinancialInstanceRecord,
): Promise<void> {
  await auditRepository.recordAuditEvent(client, {
    userId,
    action: 'payment_corrected',
    targetTable: 'financial_instances',
    targetId: after.id,
    detail: {
      period: after.period,
      previousStatus: before.status,
      previousPaidAmount: before.paidAmount,
      previousPaidDate: before.paidDate,
      status: after.status,
      paidAmount: after.paidAmount,
      paidDate: after.paidDate,
    },
  });
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

  if (decision.wasCorrection) await auditCorrection(client, userId, instance, updated);

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


export interface InstanceView {
  instance: FinancialInstanceRecord;
  obligation: FinancialObligationRecord;
  state: InstanceState;
}

/**
 * Generate this obligation's instances for a bounded window, idempotently.
 *
 * finance-rules.md is explicit on both halves: "Instances are generated ... for a
 * bounded window. Never generate an unbounded series", and "Generating instances must
 * never overwrite or reset an existing instance's payment state". So the window is
 * capped (periodsBetween), only gaps are written, and each write goes through
 * getOrCreateInstanceForPeriod, whose unique (obligation_id, period) constraint is the
 * real idempotency guarantee under concurrency.
 *
 * expected_amount is snapshotted from the obligation at creation, so later editing the
 * obligation's amount does not rewrite history.
 */
export async function generateInstances(
  client: SupabaseClient,
  userId: string,
  obligationId: string,
  fromPeriod: string,
  toPeriod: string,
): Promise<FinancialInstanceRecord[]> {
  const obligation = await financialRepository.getObligationById(client, userId, obligationId);
  if (!obligation) return [];

  const existing = await financialRepository.listInstancesForObligation(client, userId, obligationId);
  const wanted = periodsBetween(fromPeriod, toPeriod);
  const gaps = missingPeriods(existing.map((instance) => instance.period), wanted);

  const created: FinancialInstanceRecord[] = [];
  for (const period of gaps) {
    created.push(
      await financialRepository.getOrCreateInstanceForPeriod(client, {
        userId,
        obligationId,
        period,
        expectedAmount: Number(obligation.amount),
      }),
    );
  }
  return created;
}

/** Ensures the current period exists for every obligation, then returns this period's rows. */
async function ensureCurrentPeriod(
  client: SupabaseClient,
  userId: string,
  period: string,
): Promise<{ obligations: FinancialObligationRecord[]; instances: FinancialInstanceRecord[] }> {
  const obligations = await financialRepository.listObligations(client, userId);
  for (const obligation of obligations) {
    await financialRepository.getOrCreateInstanceForPeriod(client, {
      userId,
      obligationId: obligation.id,
      period,
      expectedAmount: Number(obligation.amount),
    });
  }
  const instances = await financialRepository.listInstancesForPeriod(client, userId, period);
  return { obligations, instances };
}

export interface FinanceSummary {
  period: string;
  today: string;
  requirement: MonthlyRequirementResult;
  outstanding: { currency: string; totalFormatted: string; count: number }[];
  overdue: InstanceView[];
  upcoming: InstanceView[];
}

/**
 * One read for the whole finance picture of a period: what is required, what is still
 * outstanding, what is late, and what is coming.
 *
 * Every number here is derived from stored instances at read time — nothing is cached
 * in a column. That is what makes "the same rows plus the same as-of instant always
 * produce the same output" true rather than aspirational.
 */
export async function getSummary(
  client: SupabaseClient,
  userId: string,
  now: Date,
  timezone: string,
  period?: string,
): Promise<FinanceSummary> {
  const resolvedPeriod = period ?? localPeriodString(now, timezone);
  const today = localDateString(now, timezone);

  const { obligations, instances } = await ensureCurrentPeriod(client, userId, resolvedPeriod);
  const byId = new Map(obligations.map((obligation) => [obligation.id, obligation]));

  const views: InstanceView[] = [];
  for (const instance of instances) {
    const obligation = byId.get(instance.obligationId);
    if (!obligation) continue;
    views.push({ instance, obligation, state: deriveInstanceState(instance, obligation.dueDay, today) });
  }
  views.sort((a, b) => a.state.dueDate.localeCompare(b.state.dueDate));

  const outstandingByCurrency = new Map<string, { amounts: string[]; count: number }>();
  for (const view of views) {
    if (!isOutstanding(view.instance.status)) continue;
    const bucket = outstandingByCurrency.get(view.obligation.currency) ?? { amounts: [], count: 0 };
    bucket.amounts.push(view.state.outstandingFormatted);
    bucket.count += 1;
    outstandingByCurrency.set(view.obligation.currency, bucket);
  }

  return {
    period: resolvedPeriod,
    today,
    requirement: await calculateMonthlyRequirement(client, userId, now, timezone, resolvedPeriod),
    outstanding: Array.from(outstandingByCurrency.entries()).map(([currency, bucket]) => ({
      currency,
      totalFormatted: fromMinorUnits(sumMinorUnits(bucket.amounts)),
      count: bucket.count,
    })),
    overdue: views.filter((view) => view.state.isOverdue),
    upcoming: views.filter((view) => !view.state.isOverdue && isOutstanding(view.instance.status)),
  };
}

export interface CreateObligationInput {
  accountName: string;
  obligationType: FinancialObligationRecord['obligationType'];
  amount: number;
  currency: string;
  dueDay: number;
  recurrenceRule?: string;
}

/**
 * The REST entry point for creating an obligation. Also seeds the next few periods so
 * "what's coming up" is answerable straight away rather than only after each month is
 * first touched.
 */
export async function createObligationWithWindow(
  client: SupabaseClient,
  userId: string,
  input: CreateObligationInput,
  now: Date,
  timezone: string,
  monthsAhead = 2,
): Promise<CreateObligationResult> {
  const result = await createObligation(
    client,
    userId,
    { ...input, recurrenceRule: input.recurrenceRule ?? 'monthly' },
    now,
    timezone,
  );

  const period = localPeriodString(now, timezone);
  await generateInstances(client, userId, result.obligation.id, period, addMonthsToPeriod(period, monthsAhead));

  return result;
}

export async function listInstances(
  client: SupabaseClient,
  userId: string,
  period: string,
  now: Date,
  timezone: string,
): Promise<InstanceView[]> {
  const today = localDateString(now, timezone);
  const { obligations, instances } = await ensureCurrentPeriod(client, userId, period);
  const byId = new Map(obligations.map((obligation) => [obligation.id, obligation]));

  return instances
    .flatMap((instance) => {
      const obligation = byId.get(instance.obligationId);
      if (!obligation) return [];
      return [{ instance, obligation, state: deriveInstanceState(instance, obligation.dueDay, today) }];
    })
    .sort((a, b) => a.state.dueDate.localeCompare(b.state.dueDate));
}

export type MarkInstancePaidResult =
  | { status: 'not_found' }
  | { status: 'unchanged'; instance: FinancialInstanceRecord }
  | { status: 'updated'; instance: FinancialInstanceRecord; wasCorrection: boolean };

/**
 * Mark one instance paid by id — the button on a payment row, as opposed to the
 * name-matching chat path in markPaid above. Same idempotency rule either way.
 */
export async function markInstancePaid(
  client: SupabaseClient,
  userId: string,
  instanceId: string,
  input: { amount?: number; paidDate?: string },
  now: Date,
  timezone: string,
): Promise<MarkInstancePaidResult> {
  const instance = await financialRepository.getInstanceById(client, userId, instanceId);
  if (!instance) return { status: 'not_found' };

  const amount = input.amount ?? Number(instance.expectedAmount);
  const paidDate = input.paidDate ?? localDateString(now, timezone);
  const decision = decidePaidUpdate(instance, amount, paidDate);

  if (decision.action === 'noop') return { status: 'unchanged', instance };

  const updated = await financialRepository.updateInstancePaidState(client, userId, instance.id, {
    status: decision.status,
    paidAmount: amount,
    paidDate,
  });

  if (decision.wasCorrection) await auditCorrection(client, userId, instance, updated);

  return { status: 'updated', instance: updated, wasCorrection: decision.wasCorrection };
}
