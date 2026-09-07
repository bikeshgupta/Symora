/**
 * A stopwatch for one chat turn's model time.
 *
 * The provider's own timeout bounds a single call; nothing bounded the turn. That gap is
 * how a chat request outlived its serverless function: two calls at 12s each, plus an
 * SDK that retried twice by default, and the platform killed the invocation before any
 * of Symora's own fallbacks could run. The user saw a raw 500, the circuit breaker
 * recorded nothing, and the next turn did exactly the same thing.
 *
 * So the turn gets a budget, and every model call is handed what is left of it. When too
 * little remains to be worth trying, the caller skips the model and answers with the
 * rule-based parser — a slightly worse understanding beats a dead request, and that
 * trade is only available if something is counting.
 *
 * Time is injected rather than read from the clock, for the same reason every
 * calculation in the finance layer takes `now` as a parameter: a budget you cannot
 * freeze is a budget you cannot test.
 */

/**
 * Below this, calling the model is not worth it: the request would almost certainly time
 * out mid-flight, having spent the remaining budget to produce nothing.
 */
export const MIN_MODEL_CALL_MS = 2_000;

export interface TurnBudget {
  /** Milliseconds left, never negative. */
  remainingMs(): number;
  /** Whether a call is still worth making. */
  allows(minimumMs?: number): boolean;
}

export function startTurnBudget(
  totalMs: number,
  now: () => number = () => Date.now(),
): TurnBudget {
  const startedAt = now();
  const remainingMs = () => Math.max(0, totalMs - (now() - startedAt));

  return {
    remainingMs,
    allows: (minimumMs = MIN_MODEL_CALL_MS) => remainingMs() >= minimumMs,
  };
}
