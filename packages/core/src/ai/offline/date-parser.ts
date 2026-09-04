/**
 * Deterministic relative-date parsing for the offline (no-AI-key) mode.
 *
 * The AI path hands the model temporal anchors and lets it pick; with no key there is no
 * model, so this resolves the phrase itself. Same anchors, same timezone, same clamping
 * rules — the only difference is who does the choosing
 * (.claude/rules/finance-rules.md § Determinism: `now` is always a parameter).
 *
 * Deliberately narrow. It recognises the phrasings real users actually type and returns
 * null for everything else, because a wrong date silently booked is worse than no date
 * at all — a null lets the caller ask.
 */

import { addDays } from '../../domain/commitments/recurrence';
import { nextWeekday, type TemporalAnchors, type WeekdayName } from '../../domain/temporal/temporal-context';

export interface ParsedDate {
  date: string;
  /** How the phrase was read, for showing back to the user in a confirmation. */
  matchedText: string;
  /** False when the phrase could mean two directions ("kal") and tense settled it. */
  wasAmbiguous: boolean;
}

const WEEKDAY_PATTERNS: { pattern: RegExp; weekday: WeekdayName }[] = [
  { pattern: /\b(sunday|sun|ravivar|itwar)\b/i, weekday: 'Sunday' },
  { pattern: /\b(monday|mon|somvar)\b/i, weekday: 'Monday' },
  { pattern: /\b(tuesday|tue|tues|mangalvar)\b/i, weekday: 'Tuesday' },
  { pattern: /\b(wednesday|wed|budhvar)\b/i, weekday: 'Wednesday' },
  { pattern: /\b(thursday|thu|thurs|guruvar)\b/i, weekday: 'Thursday' },
  { pattern: /\b(friday|fri|shukravar)\b/i, weekday: 'Friday' },
  { pattern: /\b(saturday|sat|shanivar)\b/i, weekday: 'Saturday' },
];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const PAST_TENSE = /\b(diya|dia|kiya|kia|liya|bhara|gaya|gayi|tha|thi|paid|did|was|were|already|hua|hui)\b/i;
const FUTURE_TENSE = /\b(karna|karni|hai|hoga|hogi|karunga|dena|dilana|dila|remind|will|need|due|bharna)\b/i;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Picks a year for a bare "12 March" — this year if it has not passed, otherwise next.
 * A date the user names without a year almost always means the coming one.
 */
function inferYear(month: number, day: number, today: string): number {
  const currentYear = Number(today.slice(0, 4));
  const candidate = `${currentYear}-${pad(month)}-${pad(day)}`;
  return candidate >= today ? currentYear : currentYear + 1;
}

export function parseDate(text: string, anchors: TemporalAnchors): ParsedDate | null {
  const lower = text.toLowerCase();

  // ISO first — unambiguous, so nothing below can override it.
  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return { date: iso[0], matchedText: iso[0], wasAmbiguous: false };

  if (/\b(today|aaj)\b/i.test(lower)) {
    return { date: anchors.today, matchedText: 'today', wasAmbiguous: false };
  }
  if (/\b(tomorrow)\b/i.test(lower)) {
    return { date: anchors.tomorrow, matchedText: 'tomorrow', wasAmbiguous: false };
  }
  if (/\b(yesterday)\b/i.test(lower)) {
    return { date: anchors.yesterday, matchedText: 'yesterday', wasAmbiguous: false };
  }

  // "kal" is both yesterday and tomorrow; "parso" is two days either side. Tense decides,
  // and when it cannot, the caller is told it was ambiguous so it can ask.
  const kal = /\bkal\b/i.test(lower);
  const parso = /\b(parso|parson)\b/i.test(lower);
  if (kal || parso) {
    const offset = parso ? 2 : 1;
    const isPast = PAST_TENSE.test(lower);
    const isFuture = FUTURE_TENSE.test(lower);
    if (isPast && !isFuture) {
      return { date: addDays(anchors.today, -offset), matchedText: parso ? 'parso' : 'kal', wasAmbiguous: false };
    }
    if (isFuture && !isPast) {
      return { date: addDays(anchors.today, offset), matchedText: parso ? 'parso' : 'kal', wasAmbiguous: false };
    }
    return { date: addDays(anchors.today, offset), matchedText: parso ? 'parso' : 'kal', wasAmbiguous: true };
  }

  // "in 5 days" / "agle 5 din" / "5 din baad"
  const inDays = lower.match(/\b(?:in|after|agle|next)\s+(\d{1,3})\s*(?:days?|din)\b/i)
    ?? lower.match(/\b(\d{1,3})\s*(?:days?|din)\s*(?:baad|later|from now)\b/i);
  if (inDays) {
    return { date: addDays(anchors.today, Number(inDays[1])), matchedText: inDays[0], wasAmbiguous: false };
  }

  if (/\bnext\s+week\b|\bagle\s+hafte\b/i.test(lower)) {
    return { date: addDays(anchors.today, 7), matchedText: 'next week', wasAmbiguous: false };
  }

  // "12 March" / "March 12" / "12th March"
  const dayMonth = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/);
  if (dayMonth && MONTHS[dayMonth[2]!]) {
    const day = Number(dayMonth[1]);
    const month = MONTHS[dayMonth[2]!]!;
    if (day >= 1 && day <= 31) {
      return {
        date: `${inferYear(month, day, anchors.today)}-${pad(month)}-${pad(day)}`,
        matchedText: dayMonth[0],
        wasAmbiguous: false,
      };
    }
  }
  const monthDay = lower.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDay && MONTHS[monthDay[1]!]) {
    const month = MONTHS[monthDay[1]!]!;
    const day = Number(monthDay[2]);
    if (day >= 1 && day <= 31) {
      return {
        date: `${inferYear(month, day, anchors.today)}-${pad(month)}-${pad(day)}`,
        matchedText: monthDay[0],
        wasAmbiguous: false,
      };
    }
  }

  // Weekday names resolve to the coming occurrence, never today.
  for (const { pattern, weekday } of WEEKDAY_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      return { date: nextWeekday(anchors.today, weekday), matchedText: match[0], wasAmbiguous: false };
    }
  }

  return null;
}

/** "2 days before" / "2 din pehle" — the lead time on a reminder. */
const LEAD_DAYS = /\b(\d{1,3})\s*(?:days?|din)\s*(?:before|pehle|prior|ahead)\b/i;

export function parseLeadDays(text: string): number | null {
  const match = text.match(LEAD_DAYS);
  if (!match) return null;
  const days = Number(match[1]);
  return days >= 0 && days <= 365 ? days : null;
}

/**
 * Removes the phrase `parseLeadDays` read.
 *
 * The lead time is structure, not subject: left in place it turns "remind me 2 days
 * before every bill" into a reminder titled "2 days before bill", which is what the
 * user then reads in their list.
 */
export function stripLeadDays(text: string): string {
  return text.replace(LEAD_DAYS, ' ');
}

/** "on the 5th" / "5 tarikh" / "every month on 5" — the day of month an EMI falls due. */
const DUE_DAY_PATTERNS = [
  /\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\b/i,
  /\b(\d{1,2})\s*(?:tarikh|tareekh)\b/i,
  /\b(\d{1,2})(?:st|nd|rd|th)\b/i,
];

/** The first pattern that reads as a usable day of month, with the text it matched. */
function matchDueDay(text: string): { day: number; matchedText: string } | null {
  for (const pattern of DUE_DAY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const day = Number(match[1]);
    if (day >= 1 && day <= 31) return { day, matchedText: match[0] };
  }
  return null;
}

export function parseDueDay(text: string): number | null {
  return matchDueDay(text)?.day ?? null;
}

/**
 * Removes the phrase `parseDueDay` read, so the due day does not survive into an
 * account name — "Home loan month 5th" is not what the user calls their loan.
 */
export function stripDueDay(text: string): string {
  const match = matchDueDay(text);
  return match ? text.replace(match.matchedText, ' ') : text;
}
