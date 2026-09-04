/**
 * Deterministic date arithmetic for commitments (PROGRESS.md Phase 4: important dates,
 * recurring reminders, lead-time preference).
 *
 * Pure functions over 'YYYY-MM-DD' strings already resolved in the user's timezone by
 * the caller. Nothing here reads a clock — `today` is always a parameter, so the same
 * inputs always produce the same answer (.claude/rules/finance-rules.md § Determinism).
 *
 * Every function works on the string form rather than constructing a local `Date`.
 * `new Date('2026-09-04')` parses as UTC midnight and then renders in the runtime's own
 * zone, which silently shifts the day for anyone west of UTC — exactly the class of bug
 * finance-rules.md forbids relying on server timezone for.
 */

export type RecurrenceRule = 'none' | 'yearly' | 'monthly' | 'weekly';

const DAY_MS = 86_400_000;

function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

function parts(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y!, month: m!, day: d! };
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Shifts a date by whole days. UTC-based throughout, so no DST or zone drift. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = parts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return format(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = parts(from);
  const b = parts(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS,
  );
}

/**
 * The next occurrence of an annually recurring date (a birthday, an anniversary, a
 * policy renewal), on or after `today`.
 *
 * Feb 29 is clamped to Feb 28 in a non-leap year, the same "clamp, never roll into the
 * next month" rule migration-era finance code applies to a due_day of 31
 * (.claude/rules/finance-rules.md § Instance generation). Rolling a birthday to March 1
 * would quietly move it.
 */
export function nextAnnualOccurrence(anchorDate: string, today: string): string {
  const anchor = parts(anchorDate);
  const currentYear = parts(today).year;

  for (const year of [currentYear, currentYear + 1]) {
    const day = Math.min(anchor.day, daysInMonth(year, anchor.month));
    const candidate = format(year, anchor.month, day);
    if (candidate >= today) return candidate;
  }

  // Unreachable for a valid anchor: next year's occurrence is always >= today.
  const day = Math.min(anchor.day, daysInMonth(currentYear + 1, anchor.month));
  return format(currentYear + 1, anchor.month, day);
}

/**
 * The next occurrence for any V1 recurrence rule. A one-off ('none') has no next
 * occurrence once its date has passed, so this returns null rather than inventing one.
 */
export function nextOccurrence(
  anchorDate: string,
  rule: RecurrenceRule,
  today: string,
): string | null {
  switch (rule) {
    case 'none':
      return anchorDate >= today ? anchorDate : null;
    case 'yearly':
      return nextAnnualOccurrence(anchorDate, today);
    case 'monthly': {
      if (anchorDate >= today) return anchorDate;
      const anchor = parts(anchorDate);
      const from = parts(today);
      // Walk forward from the current month; at most one step is ever needed.
      for (const offset of [0, 1]) {
        const month0 = from.month - 1 + offset;
        const year = from.year + Math.floor(month0 / 12);
        const month = (month0 % 12) + 1;
        const candidate = format(year, month, Math.min(anchor.day, daysInMonth(year, month)));
        if (candidate >= today) return candidate;
      }
      return null;
    }
    case 'weekly': {
      if (anchorDate >= today) return anchorDate;
      const gap = daysBetween(anchorDate, today);
      const weeks = Math.ceil(gap / 7);
      return addDays(anchorDate, weeks * 7);
    }
  }
}

/**
 * Parses the free-text `recurrence_rule` column into one of the four V1 shapes.
 *
 * The column holds whatever the extraction model wrote ("monthly", "every month",
 * "yearly on the 5th"), so this is a narrowing of untrusted text, not a full RRULE
 * parser. Anything unrecognized is 'none' — treating an unparseable rule as recurring
 * would invent occurrences the user never asked for.
 */
export function parseRecurrenceRule(rule: string | null | undefined): RecurrenceRule {
  if (!rule) return 'none';
  const normalized = rule.toLowerCase();
  if (/\b(year|yearly|annual|annually|birthday|anniversary)\b/.test(normalized)) return 'yearly';
  if (/\b(month|monthly)\b/.test(normalized)) return 'monthly';
  if (/\b(week|weekly)\b/.test(normalized)) return 'weekly';
  return 'none';
}

/**
 * When a commitment should surface, given its due date and lead time.
 * `leadDays` of null or 0 means the due date itself.
 */
export function computeFireDate(dueDate: string, leadDays: number | null): string {
  if (!leadDays || leadDays <= 0) return dueDate;
  return addDays(dueDate, -leadDays);
}

export type DueUrgency = 'overdue' | 'due-today' | 'due-soon' | 'upcoming';

/**
 * Classifies how urgent a due date is, as of `today`.
 *
 * This is the single place that decides "overdue" for commitments, so the chat
 * summaries, the API and the Phase 6 cards cannot drift apart. `soonWithinDays` is the
 * window the caller considers "needs attention"; the default matches the one-week
 * horizon the home screen will use.
 */
export function classifyDueDate(
  dueDate: string | null,
  today: string,
  soonWithinDays = 7,
): DueUrgency | null {
  if (!dueDate) return null;
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'due-today';
  return daysBetween(today, dueDate) <= soonWithinDays ? 'due-soon' : 'upcoming';
}
