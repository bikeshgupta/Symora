import { describe, expect, it } from 'vitest';
import { computeDueDateForPeriod, localDateString, localPeriodString } from './period';

describe('computeDueDateForPeriod', () => {
  it('uses the due day as-is when the month has enough days', () => {
    expect(computeDueDateForPeriod('2026-09', 5)).toBe('2026-09-05');
    expect(computeDueDateForPeriod('2026-01', 31)).toBe('2026-01-31');
  });

  it('clamps to the last day of a short month instead of rolling into the next one', () => {
    expect(computeDueDateForPeriod('2026-09', 31)).toBe('2026-09-30');
    expect(computeDueDateForPeriod('2026-02', 30)).toBe('2026-02-28');
    // 2028 is a leap year.
    expect(computeDueDateForPeriod('2028-02', 30)).toBe('2028-02-29');
  });
});

describe('localDateString / localPeriodString', () => {
  it('formats a fixed instant in the given timezone, not the server timezone', () => {
    // 2026-09-02T23:30:00Z is already 2026-09-03 in Asia/Kolkata (+05:30).
    const instant = new Date('2026-09-02T23:30:00Z');
    expect(localDateString(instant, 'Asia/Kolkata')).toBe('2026-09-03');
    expect(localDateString(instant, 'UTC')).toBe('2026-09-02');
    expect(localPeriodString(instant, 'Asia/Kolkata')).toBe('2026-09');
  });
});
