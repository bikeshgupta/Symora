import { describe, expect, it } from 'vitest';
import {
  buildTemporalAnchors,
  hasAmbiguousRelativeDate,
  looksFutureTense,
  looksPastTense,
  needsRelativeDateClarification,
  nextWeekday,
  renderTemporalContext,
  weekdayOf,
} from './temporal-context';

describe('weekdayOf', () => {
  it('names the weekday for a wall-clock date', () => {
    expect(weekdayOf('2026-09-04')).toBe('Friday');
    expect(weekdayOf('2026-09-05')).toBe('Saturday');
  });

  it('does not drift across a month boundary', () => {
    expect(weekdayOf('2026-03-01')).toBe('Sunday');
  });
});

describe('nextWeekday', () => {
  it('finds the coming occurrence later this week', () => {
    // Friday 2026-09-04 → the next Saturday is tomorrow.
    expect(nextWeekday('2026-09-04', 'Saturday')).toBe('2026-09-05');
  });

  it('wraps into next week when the day has passed', () => {
    expect(nextWeekday('2026-09-04', 'Monday')).toBe('2026-09-07');
  });

  it('returns a week out when today is that weekday, never today itself', () => {
    expect(nextWeekday('2026-09-04', 'Friday')).toBe('2026-09-11');
  });
});

describe('buildTemporalAnchors', () => {
  // 2026-09-04T20:30Z is already 2026-09-05 in Kolkata (UTC+5:30). Resolving in the
  // user's zone rather than UTC is the whole point.
  const evening = new Date('2026-09-04T20:30:00.000Z');

  it('resolves today in the user timezone, not UTC', () => {
    expect(buildTemporalAnchors(evening, 'Asia/Kolkata').today).toBe('2026-09-05');
    expect(buildTemporalAnchors(evening, 'UTC').today).toBe('2026-09-04');
  });

  it('derives tomorrow and yesterday from that local today', () => {
    const anchors = buildTemporalAnchors(evening, 'Asia/Kolkata');
    expect(anchors.tomorrow).toBe('2026-09-06');
    expect(anchors.yesterday).toBe('2026-09-04');
  });

  it('lists every weekday so the model never has to compute one', () => {
    const anchors = buildTemporalAnchors(evening, 'Asia/Kolkata');
    expect(anchors.upcomingWeekdays).toHaveLength(7);
    expect(anchors.upcomingWeekdays.every((entry) => entry.date > anchors.today)).toBe(true);
  });
});

describe('renderTemporalContext', () => {
  it('states today, its weekday and the timezone', () => {
    const block = renderTemporalContext(buildTemporalAnchors(new Date('2026-09-04T06:00:00.000Z'), 'Asia/Kolkata'));
    expect(block).toContain('2026-09-04');
    expect(block).toContain('Friday');
    expect(block).toContain('Asia/Kolkata');
  });

  it('warns the model about kal and parso in both directions', () => {
    const block = renderTemporalContext(buildTemporalAnchors(new Date('2026-09-04T06:00:00.000Z'), 'UTC'));
    expect(block).toContain('kal');
    expect(block).toContain('parso');
  });
});

describe('ambiguous relative dates (ai-pipeline.md: surface, do not guess)', () => {
  it('spots the ambiguous Hindi terms', () => {
    expect(hasAmbiguousRelativeDate('kal EMI bhar diya')).toBe(true);
    expect(hasAmbiguousRelativeDate('parso doctor ke paas jana hai')).toBe(true);
  });

  it('does not flag unambiguous relative words', () => {
    expect(hasAmbiguousRelativeDate('remind me tomorrow')).toBe(false);
    expect(hasAmbiguousRelativeDate('next Saturday')).toBe(false);
  });

  it('reads past tense from Hinglish markers', () => {
    expect(looksPastTense('kal wali EMI bhar diya')).toBe(true);
    expect(looksFutureTense('kal EMI bharna hai')).toBe(true);
  });

  it('settles an ambiguous term when the tense makes the direction clear', () => {
    expect(needsRelativeDateClarification('kal wali EMI bhar diya')).toBe(false);
    expect(needsRelativeDateClarification('kal EMI bharna hai')).toBe(false);
  });

  it('asks when the term is ambiguous and the tense settles nothing', () => {
    expect(needsRelativeDateClarification('kal EMI')).toBe(true);
  });

  it('never asks when there is no ambiguous term at all', () => {
    expect(needsRelativeDateClarification('pay the home loan')).toBe(false);
  });
});
