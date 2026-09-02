/**
 * Pure calendar helpers (.claude/rules/finance-rules.md § Timezone / Instance
 * generation). Every function takes `now`/`timezone` explicitly — never `Date.now()`
 * internally — so callers stay deterministic and testable with a fixed instant.
 */

/** 'YYYY-MM-DD' in the given IANA timezone. en-CA formats dates in ISO order. */
export function localDateString(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** 'YYYY-MM' in the given IANA timezone. */
export function localPeriodString(now: Date, timezone: string): string {
  return localDateString(now, timezone).slice(0, 7);
}

function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

/**
 * The due date for a period + due_day, clamping to the last day of short months
 * (finance-rules.md: "Clamp — never roll into the next month"). Pure calendar
 * arithmetic on already-local wall-clock values; no timezone conversion needed here.
 */
export function computeDueDateForPeriod(period: string, dueDay: number): string {
  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const clampedDay = Math.min(dueDay, daysInMonth(year, month));
  return `${yearStr}-${monthStr}-${String(clampedDay).padStart(2, '0')}`;
}
