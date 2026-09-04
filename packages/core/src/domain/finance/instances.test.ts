import { describe, expect, it } from 'vitest';
import {
  addMonthsToPeriod,
  deriveInstanceState,
  isOutstanding,
  MAX_GENERATED_PERIODS,
  missingPeriods,
  periodsBetween,
} from './instances';

describe('addMonthsToPeriod', () => {
  it('crosses a year boundary in both directions', () => {
    expect(addMonthsToPeriod('2026-11', 3)).toBe('2027-02');
    expect(addMonthsToPeriod('2026-02', -3)).toBe('2025-11');
  });

  it('is a no-op for zero', () => {
    expect(addMonthsToPeriod('2026-09', 0)).toBe('2026-09');
  });
});

describe('periodsBetween (finance-rules.md: never generate an unbounded series)', () => {
  it('is inclusive at both ends', () => {
    expect(periodsBetween('2026-09', '2026-12')).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });

  it('returns a single period when both ends match', () => {
    expect(periodsBetween('2026-09', '2026-09')).toEqual(['2026-09']);
  });

  it('returns nothing for a backwards range instead of throwing', () => {
    expect(periodsBetween('2026-12', '2026-09')).toEqual([]);
  });

  it('caps a runaway range at the hard ceiling', () => {
    expect(periodsBetween('2026-01', '2099-01')).toHaveLength(MAX_GENERATED_PERIODS);
  });
});

describe('missingPeriods', () => {
  it('returns only the gaps, so existing payment state is never touched', () => {
    expect(missingPeriods(['2026-09', '2026-11'], ['2026-09', '2026-10', '2026-11', '2026-12'])).toEqual([
      '2026-10',
      '2026-12',
    ]);
  });

  it('returns nothing when every wanted period already exists', () => {
    expect(missingPeriods(['2026-09', '2026-10'], ['2026-09'])).toEqual([]);
  });
});

describe('deriveInstanceState', () => {
  const base = { period: '2026-09', expectedAmount: '42500.00', paidAmount: null } as const;

  it('clamps a day-31 due day to a 30-day month', () => {
    const state = deriveInstanceState({ ...base, status: 'pending' }, 31, '2026-09-04');
    expect(state.dueDate).toBe('2026-09-30');
  });

  it('reports a past-due pending instance as overdue without it being stored that way', () => {
    const state = deriveInstanceState({ ...base, status: 'pending' }, 5, '2026-09-06');
    expect(state.isOverdue).toBe(true);
    expect(state.status).toBe('overdue');
  });

  it('is not overdue on the due date itself', () => {
    const state = deriveInstanceState({ ...base, status: 'pending' }, 5, '2026-09-05');
    expect(state.isOverdue).toBe(false);
  });

  it('never calls a paid instance overdue, however late the date', () => {
    const state = deriveInstanceState(
      { ...base, status: 'paid', paidAmount: '42500.00' },
      5,
      '2026-12-31',
    );
    expect(state.isOverdue).toBe(false);
    expect(state.outstandingFormatted).toBe('0.00');
  });

  it('reports the remainder outstanding on a partial payment', () => {
    const state = deriveInstanceState(
      { ...base, status: 'partial', paidAmount: '20000.00' },
      5,
      '2026-09-04',
    );
    expect(state.outstandingFormatted).toBe('22500.00');
    expect(state.isOverdue).toBe(false);
  });

  it('a partial payment still goes overdue once its due date passes', () => {
    const state = deriveInstanceState(
      { ...base, status: 'partial', paidAmount: '20000.00' },
      5,
      '2026-09-10',
    );
    expect(state.isOverdue).toBe(true);
  });

  it('never reports a negative amount outstanding after an overpayment', () => {
    const state = deriveInstanceState(
      { ...base, status: 'paid', paidAmount: '50000.00' },
      5,
      '2026-09-04',
    );
    expect(state.outstandingFormatted).toBe('0.00');
  });

  it('treats a skipped instance as owing nothing', () => {
    const state = deriveInstanceState({ ...base, status: 'skipped' }, 5, '2026-12-01');
    expect(state.outstandingFormatted).toBe('0.00');
    expect(state.isOverdue).toBe(false);
  });

  it('does not lose paise to floating point', () => {
    const state = deriveInstanceState(
      { period: '2026-09', expectedAmount: '0.30', paidAmount: '0.10', status: 'partial' },
      5,
      '2026-09-04',
    );
    expect(state.outstandingFormatted).toBe('0.20');
  });
});

describe('isOutstanding', () => {
  it('counts pending, partial and overdue', () => {
    expect(['pending', 'partial', 'overdue'].every((s) => isOutstanding(s as 'pending'))).toBe(true);
  });

  it('excludes paid and skipped', () => {
    expect(isOutstanding('paid')).toBe(false);
    expect(isOutstanding('skipped')).toBe(false);
  });
});
