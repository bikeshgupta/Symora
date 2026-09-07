import { describe, expect, it } from 'vitest';
import { MIN_MODEL_CALL_MS, startTurnBudget } from './turn-budget';

/** A clock the test moves by hand — the only kind a budget can be tested against. */
function fakeClock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('startTurnBudget', () => {
  it('hands out what is left, never a negative', () => {
    const clock = fakeClock();
    const budget = startTurnBudget(20_000, clock.now);

    expect(budget.remainingMs()).toBe(20_000);
    clock.advance(12_000);
    expect(budget.remainingMs()).toBe(8_000);
    clock.advance(30_000);
    expect(budget.remainingMs()).toBe(0);
  });

  it('stops allowing a call once too little is left to be worth making', () => {
    const clock = fakeClock();
    const budget = startTurnBudget(20_000, clock.now);

    expect(budget.allows()).toBe(true);
    clock.advance(20_000 - MIN_MODEL_CALL_MS);
    expect(budget.allows()).toBe(true);
    clock.advance(1);
    expect(budget.allows()).toBe(false);
  });

  it('takes a caller-specified minimum', () => {
    const clock = fakeClock();
    const budget = startTurnBudget(10_000, clock.now);

    clock.advance(6_000);
    expect(budget.allows(3_000)).toBe(true);
    expect(budget.allows(5_000)).toBe(false);
  });

  it('never allows a call once the budget is spent, whatever the minimum', () => {
    const clock = fakeClock();
    const budget = startTurnBudget(1_000, clock.now);
    clock.advance(1_000);

    expect(budget.allows(0)).toBe(true); // zero is genuinely satisfiable
    expect(budget.allows(1)).toBe(false);
    expect(budget.remainingMs()).toBe(0);
  });
});
