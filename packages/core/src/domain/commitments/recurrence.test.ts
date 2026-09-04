import { describe, expect, it } from 'vitest';
import {
  addDays,
  classifyDueDate,
  computeFireDate,
  daysBetween,
  nextAnnualOccurrence,
  nextOccurrence,
  parseRecurrenceRule,
} from './recurrence';

describe('addDays / daysBetween', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary backwards', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('counts days between dates, signed', () => {
    expect(daysBetween('2026-09-01', '2026-09-04')).toBe(3);
    expect(daysBetween('2026-09-04', '2026-09-01')).toBe(-3);
    expect(daysBetween('2026-09-04', '2026-09-04')).toBe(0);
  });
});

describe('nextAnnualOccurrence (birthdays, anniversaries, renewals)', () => {
  it('returns this year when the date is still ahead', () => {
    expect(nextAnnualOccurrence('1990-12-25', '2026-09-04')).toBe('2026-12-25');
  });

  it('returns today when it falls today', () => {
    expect(nextAnnualOccurrence('1990-09-04', '2026-09-04')).toBe('2026-09-04');
  });

  it('rolls to next year once the date has passed', () => {
    expect(nextAnnualOccurrence('1990-03-01', '2026-09-04')).toBe('2027-03-01');
  });

  it('clamps Feb 29 to Feb 28 in a non-leap year rather than rolling to March', () => {
    expect(nextAnnualOccurrence('1992-02-29', '2027-01-01')).toBe('2027-02-28');
  });

  it('keeps Feb 29 in a leap year', () => {
    expect(nextAnnualOccurrence('1992-02-29', '2028-01-01')).toBe('2028-02-29');
  });
});

describe('nextOccurrence', () => {
  it('returns null for a one-off whose date has passed', () => {
    expect(nextOccurrence('2026-01-01', 'none', '2026-09-04')).toBeNull();
  });

  it('returns the date itself for a one-off still ahead', () => {
    expect(nextOccurrence('2026-12-01', 'none', '2026-09-04')).toBe('2026-12-01');
  });

  it('advances a monthly rule to this month when the day is still ahead', () => {
    expect(nextOccurrence('2026-01-15', 'monthly', '2026-09-04')).toBe('2026-09-15');
  });

  it('advances a monthly rule to next month once the day has passed', () => {
    expect(nextOccurrence('2026-01-02', 'monthly', '2026-09-04')).toBe('2026-10-02');
  });

  it('clamps a monthly day-31 rule to a short month', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-09-15')).toBe('2026-09-30');
  });

  it('advances a weekly rule by whole weeks, preserving the weekday', () => {
    // 2026-09-05 is a Saturday; the next Saturday on or after 2026-09-08 is the 12th.
    expect(nextOccurrence('2026-09-05', 'weekly', '2026-09-08')).toBe('2026-09-12');
  });
});

describe('parseRecurrenceRule', () => {
  it('recognises the shapes the extraction model actually writes', () => {
    expect(parseRecurrenceRule('monthly')).toBe('monthly');
    expect(parseRecurrenceRule('every month on the 5th')).toBe('monthly');
    expect(parseRecurrenceRule('yearly')).toBe('yearly');
    expect(parseRecurrenceRule('annually')).toBe('yearly');
    expect(parseRecurrenceRule('weekly on Saturday')).toBe('weekly');
  });

  it('treats null, empty and unparseable rules as non-recurring', () => {
    expect(parseRecurrenceRule(null)).toBe('none');
    expect(parseRecurrenceRule('')).toBe('none');
    expect(parseRecurrenceRule('whenever I feel like it')).toBe('none');
  });
});

describe('computeFireDate (lead-time preference)', () => {
  it('fires on the due date when there is no lead time', () => {
    expect(computeFireDate('2026-09-10', null)).toBe('2026-09-10');
    expect(computeFireDate('2026-09-10', 0)).toBe('2026-09-10');
  });

  it('fires the stated number of days earlier', () => {
    expect(computeFireDate('2026-09-10', 2)).toBe('2026-09-08');
  });

  it('crosses a month boundary backwards', () => {
    expect(computeFireDate('2026-09-01', 2)).toBe('2026-08-30');
  });
});

describe('classifyDueDate', () => {
  const today = '2026-09-04';

  it('has no urgency for an undated commitment', () => {
    expect(classifyDueDate(null, today)).toBeNull();
  });

  it('classifies the boundaries', () => {
    expect(classifyDueDate('2026-09-03', today)).toBe('overdue');
    expect(classifyDueDate('2026-09-04', today)).toBe('due-today');
    expect(classifyDueDate('2026-09-11', today)).toBe('due-soon');
    expect(classifyDueDate('2026-09-12', today)).toBe('upcoming');
  });

  it('honours a caller-supplied window', () => {
    expect(classifyDueDate('2026-09-06', today, 1)).toBe('upcoming');
    expect(classifyDueDate('2026-09-05', today, 1)).toBe('due-soon');
  });
});
