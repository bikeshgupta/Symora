import { describe, expect, it } from 'vitest';
import { decideSupersede, isCurrentAsOf, isSuperseded } from './effective-dates';

describe('isCurrentAsOf (data-model.md § memories, effective_to is exclusive)', () => {
  const open = { effectiveFrom: '2026-03-01', effectiveTo: null };

  it('is current on the day it takes effect', () => {
    expect(isCurrentAsOf(open, '2026-03-01')).toBe(true);
  });

  it('is not yet current the day before it takes effect', () => {
    expect(isCurrentAsOf(open, '2026-02-28')).toBe(false);
  });

  it('stays current while effective_to is null', () => {
    expect(isCurrentAsOf(open, '2030-12-31')).toBe(true);
  });

  it('is current up to but not including effective_to', () => {
    const closed = { effectiveFrom: '2026-03-01', effectiveTo: '2026-09-04' };
    expect(isCurrentAsOf(closed, '2026-09-03')).toBe(true);
    expect(isCurrentAsOf(closed, '2026-09-04')).toBe(false);
  });

  it('leaves no gap and no overlap across a supersede boundary', () => {
    const oldRow = { effectiveFrom: '2026-03-01', effectiveTo: '2026-09-04' };
    const newRow = { effectiveFrom: '2026-09-04', effectiveTo: null };

    // Exactly one row is in effect on the handover date.
    expect(isCurrentAsOf(oldRow, '2026-09-04')).toBe(false);
    expect(isCurrentAsOf(newRow, '2026-09-04')).toBe(true);
    expect(isCurrentAsOf(oldRow, '2026-09-03')).toBe(true);
    expect(isCurrentAsOf(newRow, '2026-09-03')).toBe(false);
  });
});

describe('isSuperseded', () => {
  it('is false for an open window', () => {
    expect(isSuperseded({ effectiveFrom: '2026-01-01', effectiveTo: null }, '2026-09-04')).toBe(false);
  });

  it('is true once the end date is reached', () => {
    expect(isSuperseded({ effectiveFrom: '2026-01-01', effectiveTo: '2026-09-04' }, '2026-09-04')).toBe(true);
  });

  it('is false for a window that ends in the future', () => {
    expect(isSuperseded({ effectiveFrom: '2026-01-01', effectiveTo: '2026-12-01' }, '2026-09-04')).toBe(false);
  });
});

describe('decideSupersede', () => {
  it('inserts when nothing is current for the key', () => {
    expect(decideSupersede(null, 'Sunita', '2026-09-04')).toEqual({ action: 'insert' });
  });

  it('is a no-op when the user restates the same value', () => {
    const current = { text: 'Sunita', effectiveFrom: '2026-03-01' };
    expect(decideSupersede(current, 'Sunita', '2026-09-04')).toEqual({
      action: 'noop',
      reason: 'identical',
    });
  });

  it('supersedes when the value changes, closing the old window today', () => {
    const current = { text: 'Sunita', effectiveFrom: '2026-03-01' };
    expect(decideSupersede(current, 'Sunita Sharma', '2026-09-04')).toEqual({
      action: 'supersede',
      effectiveTo: '2026-09-04',
    });
  });

  it('never closes a window before it opened, even correcting on the same day', () => {
    const current = { text: 'Sunita', effectiveFrom: '2026-09-04' };
    const decision = decideSupersede(current, 'Sunita Sharma', '2026-09-04');
    expect(decision).toEqual({ action: 'supersede', effectiveTo: '2026-09-04' });
  });

  it('clamps to effectiveFrom when asOf somehow precedes it', () => {
    const current = { text: 'Sunita', effectiveFrom: '2026-09-04' };
    const decision = decideSupersede(current, 'Sunita Sharma', '2026-09-01');
    expect(decision).toEqual({ action: 'supersede', effectiveTo: '2026-09-04' });
  });
});
