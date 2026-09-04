/**
 * Bounded, idempotent instance generation and the derived money states
 * (.claude/rules/finance-rules.md § Instance generation, § Canonical calculations).
 *
 * Everything here is pure: it decides *which* periods should exist and *what* an
 * instance's state is, and returns that decision. Writing rows is the repository's job.
 * That split is what makes "the same stored rows plus the same as-of instant always
 * produce the same output" testable without a database.
 */

import { computeDueDateForPeriod } from './period';
import { fromMinorUnits, toMinorUnits } from './money';
import type { FinancialInstanceRecord, FinancialInstanceStatus } from '../../types/financial';

/** Hard ceiling on a single generation call — never generate an unbounded series. */
export const MAX_GENERATED_PERIODS = 24;

function periodParts(period: string): { year: number; month: number } {
  const [y, m] = period.split('-').map(Number);
  return { year: y!, month: m! };
}

function formatPeriod(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function addMonthsToPeriod(period: string, months: number): string {
  const { year, month } = periodParts(period);
  const total = year * 12 + (month - 1) + months;
  return formatPeriod(Math.floor(total / 12), (total % 12) + 1);
}

/**
 * The inclusive list of period keys from `fromPeriod` to `toPeriod`.
 *
 * Capped at MAX_GENERATED_PERIODS. A backwards range yields nothing rather than
 * throwing — a caller asking for an empty window should get an empty window, not a
 * 500 on a read path.
 */
export function periodsBetween(fromPeriod: string, toPeriod: string): string[] {
  if (toPeriod < fromPeriod) return [];

  const periods: string[] = [];
  let cursor = fromPeriod;
  while (cursor <= toPeriod && periods.length < MAX_GENERATED_PERIODS) {
    periods.push(cursor);
    cursor = addMonthsToPeriod(cursor, 1);
  }
  return periods;
}

/**
 * Which periods still need an instance for one obligation.
 *
 * Generation must never disturb an instance that already exists — an existing row may
 * carry payment state, and finance-rules.md is explicit that "generating instances must
 * never overwrite or reset an existing instance's payment state". So this returns only
 * the gaps. The unique (obligation_id, period) constraint is what actually guarantees
 * idempotency under concurrency; this just avoids pointless write attempts.
 */
export function missingPeriods(existingPeriods: string[], wantedPeriods: string[]): string[] {
  const existing = new Set(existingPeriods);
  return wantedPeriods.filter((period) => !existing.has(period));
}

export interface InstanceState {
  /** Status as stored, except that a still-unpaid past-due instance reads as overdue. */
  status: FinancialInstanceStatus;
  dueDate: string;
  isOverdue: boolean;
  /** What is still owed: expected minus anything already paid. Never negative. */
  outstandingMinorUnits: bigint;
  outstandingFormatted: string;
}

/**
 * The derived state of one instance as of `today`.
 *
 * "Overdue" is computed here rather than stored. finance-rules.md defines it as
 * "pending instances whose due date is strictly before today in the user's timezone" —
 * a definition that changes answer as the day rolls over, so persisting it would mean
 * every row silently going stale overnight and needing a sweep job to fix.
 *
 * Outstanding follows the same rule the file states for a partial payment:
 * expected_amount - paid_amount, clamped at zero so an overpayment never reports as a
 * negative amount owed.
 */
export function deriveInstanceState(
  instance: Pick<FinancialInstanceRecord, 'status' | 'period' | 'expectedAmount' | 'paidAmount'>,
  dueDay: number,
  today: string,
): InstanceState {
  const dueDate = computeDueDateForPeriod(instance.period, dueDay);
  const isUnsettled =
    instance.status === 'pending' || instance.status === 'partial' || instance.status === 'overdue';
  const isOverdue = isUnsettled && dueDate < today;

  const expected = toMinorUnits(instance.expectedAmount);
  const paid = instance.paidAmount === null ? 0n : toMinorUnits(instance.paidAmount);
  const outstandingRaw = instance.status === 'skipped' ? 0n : expected - paid;
  const outstanding = outstandingRaw > 0n ? outstandingRaw : 0n;

  return {
    status: isOverdue && instance.status === 'pending' ? 'overdue' : instance.status,
    dueDate,
    isOverdue,
    outstandingMinorUnits: outstanding,
    outstandingFormatted: fromMinorUnits(outstanding),
  };
}

/** True for the statuses finance-rules.md counts as pending/outstanding. */
export function isOutstanding(status: FinancialInstanceStatus): boolean {
  return status === 'pending' || status === 'partial' || status === 'overdue';
}
