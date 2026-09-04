/**
 * Effective-date arithmetic for memories (.claude/rules/data-model.md § memories,
 * PROGRESS.md Phase 3 "Effective-date support"). Pure functions over date strings —
 * `asOf` is always passed in, never read from the clock, so the same inputs always
 * produce the same answer (.claude/rules/finance-rules.md § Determinism).
 *
 * `effectiveTo` is an EXCLUSIVE end date, matching migration 0007: a memory is in
 * effect while `effectiveFrom <= asOf` and (`effectiveTo` is null or `asOf < effectiveTo`).
 * Superseding on date D sets the old row's `effectiveTo` to D and the new row's
 * `effectiveFrom` to D, so there is neither a gap nor an overlap on that day.
 *
 * Dates are 'YYYY-MM-DD' strings already resolved in the user's timezone by the caller
 * (see domain/finance/period.ts). Lexicographic comparison is exact for that format,
 * so nothing here constructs a Date and risks a timezone shift.
 */

export interface EffectiveWindow {
  effectiveFrom: string;
  effectiveTo: string | null;
}

export function isCurrentAsOf(window: EffectiveWindow, asOf: string): boolean {
  if (window.effectiveFrom > asOf) return false;
  return window.effectiveTo === null || asOf < window.effectiveTo;
}

/** True for a memory that has been superseded or has expired, as of `asOf`. */
export function isSuperseded(window: EffectiveWindow, asOf: string): boolean {
  return window.effectiveTo !== null && asOf >= window.effectiveTo;
}

export type SupersedeDecision =
  | { action: 'insert' }
  | { action: 'noop'; reason: 'identical' }
  | { action: 'supersede'; effectiveTo: string };

export interface CurrentMemorySnapshot {
  text: string;
  effectiveFrom: string;
}

/**
 * What to do when the user states a value for a key that may already be known.
 *
 * - Nothing current → insert.
 * - The same text again → no-op. Restating a fact is not a correction, and writing a
 *   second identical row would make the history lie about how often it changed.
 * - A different value → supersede: close the old row and insert a new one.
 *
 * The old row's `effectiveTo` never precedes its own `effectiveFrom`; a same-day
 * correction closes the old row on the day it opened, leaving it with an empty window
 * (superseded immediately) rather than an inverted one.
 */
export function decideSupersede(
  current: CurrentMemorySnapshot | null,
  incomingText: string,
  asOf: string,
): SupersedeDecision {
  if (current === null) return { action: 'insert' };
  if (current.text === incomingText) return { action: 'noop', reason: 'identical' };

  const effectiveTo = asOf < current.effectiveFrom ? current.effectiveFrom : asOf;
  return { action: 'supersede', effectiveTo };
}
