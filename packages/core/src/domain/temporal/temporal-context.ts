/**
 * Resolving relative dates (PROGRESS.md Phase 7; .claude/rules/ai-pipeline.md
 * § Confidence and confirmation: "Ambiguous relative dates ('kal' is both yesterday and
 * tomorrow in Hindi; 'next Saturday') are resolved from context in the user's timezone,
 * and surfaced in the confirmation or a clarifying question when context does not
 * settle it").
 *
 * The model cannot resolve "kal", "Saturday" or "agle 5 din" on its own — it has no
 * reliable idea what today is, and asking it to work one out invites a plausible wrong
 * answer. So the anchors are computed here, in code, in the user's timezone, and handed
 * to the model as facts to pick from. The model chooses a label; the date attached to
 * that label came from this file.
 */

import { addDays, daysBetween } from '../commitments/recurrence';
import { localDateString } from '../finance/period';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

/**
 * Day of week for a 'YYYY-MM-DD' wall-clock date.
 *
 * Uses a UTC-constructed Date purely as a calendar calculator on values that are already
 * local to the user — no timezone conversion happens, so this cannot drift the way
 * `new Date('2026-09-04').getDay()` does in a non-UTC runtime.
 */
export function weekdayOf(date: string): WeekdayName {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/** The next occurrence of a weekday strictly after `today`. "This Saturday". */
export function nextWeekday(today: string, weekday: WeekdayName): string {
  const target = WEEKDAY_NAMES.indexOf(weekday);
  const current = WEEKDAY_NAMES.indexOf(weekdayOf(today));
  const delta = (target - current + 7) % 7;
  return addDays(today, delta === 0 ? 7 : delta);
}

export interface TemporalAnchors {
  today: string;
  todayWeekday: WeekdayName;
  tomorrow: string;
  yesterday: string;
  timezone: string;
  /** Named weekdays resolved to the coming occurrence, e.g. "Saturday" → 2026-09-05. */
  upcomingWeekdays: { weekday: WeekdayName; date: string }[];
}

export function buildTemporalAnchors(now: Date, timezone: string): TemporalAnchors {
  const today = localDateString(now, timezone);
  return {
    today,
    todayWeekday: weekdayOf(today),
    tomorrow: addDays(today, 1),
    yesterday: addDays(today, -1),
    timezone,
    upcomingWeekdays: WEEKDAY_NAMES.map((weekday) => ({ weekday, date: nextWeekday(today, weekday) })),
  };
}

/**
 * The block handed to the extraction model. Facts only — dates this file computed — so
 * the model's job is to pick the right one, not to do calendar arithmetic.
 */
export function renderTemporalContext(anchors: TemporalAnchors): string {
  const weekdays = anchors.upcomingWeekdays
    .map((entry) => `${entry.weekday} = ${entry.date}`)
    .join(', ');

  return [
    `Today is ${anchors.today} (${anchors.todayWeekday}) in the user's timezone (${anchors.timezone}).`,
    `Tomorrow is ${anchors.tomorrow}. Yesterday was ${anchors.yesterday}.`,
    `The next occurrence of each weekday: ${weekdays}.`,
    'Resolve every relative date the user gives ("tomorrow", "next Saturday", "in 5 days",',
    '"kal", "parso", "agle hafte") against these dates. Never compute a date any other way,',
    'and never output a date you cannot derive from the values above.',
    'Hindi "kal" and "parso" mean either direction in time — tomorrow or yesterday, the day',
    'after or the day before. Use the surrounding tense to choose: a past-tense sentence',
    '("bhar diya", "kar diya") means the past one. If the tense does not settle it, do not',
    'guess — ask which one they meant.',
  ].join(' ');
}

/**
 * Relative terms that are genuinely ambiguous in direction rather than merely relative.
 *
 * "kal" and "parso" are the canonical cases: Hindi uses one word for both the day before
 * and the day after. Tense usually settles it, and the prompt says so — but when a write
 * hangs on the answer, guessing wrong silently books a payment on the wrong date, so the
 * pipeline surfaces it instead.
 */
const AMBIGUOUS_TERMS = /\b(kal|parso|parson|narso)\b/i;

export function hasAmbiguousRelativeDate(text: string): boolean {
  return AMBIGUOUS_TERMS.test(text);
}

/**
 * Past-tense markers common to Hindi/Hinglish statements of something already done.
 * Used only to decide whether an ambiguous term is settled enough to proceed without a
 * clarifying question — never to compute a date.
 */
const PAST_TENSE_MARKERS =
  /\b(diya|diyaa|dia|kiya|kia|hua|hui|tha|thi|the|gaya|gayi|liya|bhara|bhar\s+diya|ho\s+gaya|paid|did|was|were|already)\b/i;

export function looksPastTense(text: string): boolean {
  return PAST_TENSE_MARKERS.test(text);
}

/**
 * Whether an ambiguous relative date needs a clarifying question.
 *
 * Ambiguous *and* tenseless is the only case the pipeline cannot settle: "kal EMI bhar
 * diya" is clearly the past, "kal EMI bharna hai" is clearly the future, but a bare
 * "kal EMI" is a coin flip and a coin flip is not good enough for a payment date.
 */
export function needsRelativeDateClarification(text: string): boolean {
  return hasAmbiguousRelativeDate(text) && !looksPastTense(text) && !looksFutureTense(text);
}

const FUTURE_TENSE_MARKERS =
  /\b(karna|karni|karno|hai|hoga|hogi|karunga|karungi|dena|dilana|dila|remind|will|need|have\s+to|due)\b/i;

export function looksFutureTense(text: string): boolean {
  return FUTURE_TENSE_MARKERS.test(text);
}

/** Days between two wall-clock dates — re-exported so callers need one temporal import. */
export { daysBetween };
