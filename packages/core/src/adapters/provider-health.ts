/**
 * A circuit breaker in front of the model endpoint.
 *
 * Symora is designed to be pointed at a model you run yourself — which means the
 * endpoint is sometimes simply not there. A laptop gets shut, a tunnel drops, a home
 * connection resets. Without this, every single turn during that window pays the full
 * request timeout before falling back to the rule-based parser: the app still works, but
 * every message takes twelve seconds to say so, which reads as broken rather than
 * degraded.
 *
 * So the first failure opens the circuit and the next turns fail instantly. After a
 * cooldown one request is let through to see whether the machine came back; if it did,
 * the circuit closes and nothing was lost but a minute.
 *
 * **What this is not.** Serverless functions are stateless between cold starts, so this
 * state lives only as long as a warm instance. That is still worth having — a burst of
 * turns from one user hits one warm instance, which is exactly the case this fixes — but
 * it is not a cluster-wide breaker, and the first turn on a cold instance will pay the
 * timeout again. Persisting it would cost a database round trip on every turn, which is
 * a worse trade at V1 volumes.
 */

export type ProviderState = 'ready' | 'unreachable' | 'rate_limited';

export interface ProviderHealthSnapshot {
  state: ProviderState;
  /** Consecutive failures since the endpoint last answered. */
  consecutiveFailures: number;
  /** When the circuit next lets a request through. Null when it is closed. */
  retryAt: Date | null;
  /** Why it last failed, for the log. Never shown to a user. */
  lastError: string | null;
}

/**
 * A refusal for spending too fast, as opposed to an endpoint that is not there.
 *
 * On a free tier this is the normal state at the end of a busy day, and it resolves by
 * itself — which makes it a different sentence in front of a user than "your model is
 * not answering", and a very different one from "not configured". The back-off is
 * identical; only the wording changes.
 */
export function isRateLimitFailure(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 5; depth += 1) {
    if ((current as { status?: unknown }).status === 429) return true;
    const name = (current as { name?: unknown }).name;
    if (typeof name === 'string' && /ratelimit/i.test(name)) return true;
    const message = current instanceof Error ? current.message : '';
    if (/rate limit|quota|too many requests|resource_exhausted/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Thrown instead of making a request while the circuit is open.
 *
 * A distinct class so the caller can tell "we did not try" from "we tried and it
 * failed" — the two mean different things in a log, even though the user sees the same
 * graceful fallback either way.
 */
export class ProviderUnavailableError extends Error {
  readonly retryAt: Date;

  constructor(retryAt: Date, lastError: string | null) {
    super(
      `The model endpoint is not responding; not retrying until ${retryAt.toISOString()}.` +
        (lastError ? ` Last error: ${lastError}` : ''),
    );
    this.name = 'ProviderUnavailableError';
    this.retryAt = retryAt;
  }
}

/**
 * Errors that mean "the endpoint is not there", as opposed to "the endpoint answered and
 * did not like the request".
 *
 * The distinction matters: a 400 for an unsupported parameter or a 401 for a bad key is
 * a configuration problem that will fail identically forever, and opening the circuit for
 * it would hide a fixable fault behind a "temporarily unavailable" that never resolves.
 * Only connection-level failures, timeouts, rate limits and 5xx are worth backing off
 * from.
 */
const NETWORK_CODE = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|UND_ERR/i;
const NETWORK_MESSAGE =
  /connection error|fetch failed|network|socket hang up|timed out|timeout|aborted|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET/i;

export function isReachabilityFailure(error: unknown): boolean {
  // Walk the cause chain. The OpenAI SDK wraps a refused connection in an
  // APIConnectionError whose own `name` is the bare 'Error', whose `code` is undefined,
  // and whose message is the unhelpful "Connection error." — the ECONNREFUSED that
  // actually identifies it sits one level down on `cause`. Reading only the top of the
  // chain missed the single case this whole mechanism exists for: a self-hosted endpoint
  // that is switched off.
  for (let current: unknown = error, depth = 0; current && depth < 5; depth += 1) {
    const status = (current as { status?: unknown }).status;
    if (typeof status === 'number') {
      return status === 408 || status === 429 || status >= 500;
    }

    const name = (current as { name?: unknown }).name;
    if (typeof name === 'string' && /connection|timeout|abort/i.test(name)) return true;

    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && NETWORK_CODE.test(code)) return true;

    const constructorName = (current as { constructor?: { name?: unknown } }).constructor?.name;
    if (typeof constructorName === 'string' && /connection|timeout/i.test(constructorName)) return true;

    const message = current instanceof Error ? current.message : typeof current === 'string' ? current : '';
    if (message && NETWORK_MESSAGE.test(message)) return true;

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export interface ProviderHealthOptions {
  /** How long the circuit stays open after a failure. */
  cooldownMs: number;
  /**
   * Failures tolerated before the circuit opens. One by default: a self-hosted endpoint
   * that just refused a connection is not going to accept the next one a second later,
   * and making the user wait through a second timeout to prove it helps nobody.
   */
  threshold?: number;
  /** Injected so the tests do not depend on wall-clock time. */
  now?: () => number;
}

export class ProviderHealth {
  private consecutiveFailures = 0;
  private openedUntil = 0;
  private lastError: string | null = null;
  private lastFailureWasRateLimit = false;

  private readonly cooldownMs: number;
  private readonly threshold: number;
  private readonly now: () => number;

  constructor(options: ProviderHealthOptions) {
    this.cooldownMs = options.cooldownMs;
    this.threshold = options.threshold ?? 1;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Throws ProviderUnavailableError when the circuit is open, otherwise returns.
   *
   * Once the cooldown has passed this deliberately lets the request through *without*
   * closing the circuit: half-open. If that probe also fails, the cooldown restarts from
   * then rather than from the original failure, so a machine that stays off is asked
   * about once a minute rather than once per turn.
   */
  assertAvailable(): void {
    if (this.openedUntil === 0) return;
    if (this.now() >= this.openedUntil) return;
    throw new ProviderUnavailableError(new Date(this.openedUntil), this.lastError);
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedUntil = 0;
    this.lastError = null;
    this.lastFailureWasRateLimit = false;
  }

  /**
   * Records a failure. Only reachability failures open the circuit; a rejected request
   * is reported to the caller and otherwise forgotten, because backing off from it would
   * turn a fixable misconfiguration into a silent outage.
   */
  recordFailure(error: unknown): void {
    if (!isReachabilityFailure(error)) return;

    this.consecutiveFailures += 1;
    this.lastError = error instanceof Error ? error.message : String(error);
    this.lastFailureWasRateLimit = isRateLimitFailure(error);
    if (this.consecutiveFailures >= this.threshold) {
      this.openedUntil = this.now() + this.cooldownMs;
    }
  }

  snapshot(): ProviderHealthSnapshot {
    const isOpen = this.openedUntil > 0 && this.now() < this.openedUntil;
    return {
      state: isOpen ? (this.lastFailureWasRateLimit ? 'rate_limited' : 'unreachable') : 'ready',
      consecutiveFailures: this.consecutiveFailures,
      retryAt: isOpen ? new Date(this.openedUntil) : null,
      lastError: this.lastError,
    };
  }

  /** Test-only: forget everything, so one case cannot leak into the next. */
  reset(): void {
    this.consecutiveFailures = 0;
    this.openedUntil = 0;
    this.lastError = null;
    this.lastFailureWasRateLimit = false;
  }
}
