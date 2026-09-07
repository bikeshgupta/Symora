/**
 * The circuit breaker in front of the model endpoint.
 *
 * The behaviour that matters: with a self-hosted model switched off, the *first* turn
 * pays the timeout and every turn after it fails instantly. Without that, an app that
 * technically still works takes twelve seconds per message to prove it, which a user
 * reads as broken rather than degraded.
 */

import { describe, expect, it } from 'vitest';
import { isReachabilityFailure, ProviderHealth, ProviderUnavailableError } from './provider-health';

/** A clock the test moves by hand, so nothing here depends on wall time. */
function fixedClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function connectionRefused(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:11434'), { code: 'ECONNREFUSED' });
}

describe('isReachabilityFailure', () => {
  it.each([
    ['a refused connection', connectionRefused()],
    ['a DNS failure', Object.assign(new Error('getaddrinfo ENOTFOUND ollama.example.com'), { code: 'ENOTFOUND' })],
    ['a socket timeout', Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' })],
    ['an undici fetch failure', new Error('fetch failed')],
    ['a rate limit', Object.assign(new Error('Too many requests'), { status: 429 })],
    ['a gateway error', Object.assign(new Error('Bad gateway'), { status: 502 })],
    ['an overloaded server', Object.assign(new Error('Service unavailable'), { status: 503 })],
  ])('counts %s as unreachable', (_label, error) => {
    expect(isReachabilityFailure(error)).toBe(true);
  });

  it.each([
    ['a bad key', Object.assign(new Error('Incorrect API key provided'), { status: 401 })],
    ['an unsupported parameter', Object.assign(new Error('Unsupported value: temperature'), { status: 400 })],
    ['an unknown model', Object.assign(new Error('model not found'), { status: 404 })],
  ])('does not count %s as unreachable', (_label, error) => {
    // These fail identically forever. Backing off from them would hide a fixable
    // configuration fault behind a "temporarily unavailable" that never resolves.
    expect(isReachabilityFailure(error)).toBe(false);
  });

  it('reads the SDK\'s own connection error, whose signal is one level down', () => {
    // The exact shape the OpenAI SDK throws for a refused connection, verified against a
    // real closed port. Its `name` is the bare 'Error', its `code` is undefined, and its
    // message is the unhelpful "Connection error." — the ECONNREFUSED that identifies it
    // sits on `cause`. Reading only the top of the chain missed the single case this
    // whole mechanism exists for, and every mocked test still passed.
    const sdkError = Object.assign(new Error('Connection error.'), {
      status: undefined,
      cause: Object.assign(
        new Error('request to http://127.0.0.1:11434/v1/chat/completions failed, reason: connect ECONNREFUSED'),
        { code: 'ECONNREFUSED' },
      ),
    });

    expect(isReachabilityFailure(sdkError)).toBe(true);
  });

  it('finds a network code that only appears on the cause', () => {
    // Isolates the cause walk: nothing at the top level says anything useful, so this
    // fails unless the chain is followed. The SDK's current wording ("Connection error.")
    // happens to be recognisable on its own, but wording is not a contract and the errno
    // is — this is the durable signal.
    const opaque = Object.assign(new Error('Request failed'), {
      cause: Object.assign(new Error('upstream'), { code: 'ECONNREFUSED' }),
    });

    expect(isReachabilityFailure(opaque)).toBe(true);
  });

  it('does not loop forever on a self-referencing cause chain', () => {
    const looped = new Error('nothing useful') as Error & { cause?: unknown };
    looped.cause = looped;

    expect(isReachabilityFailure(looped)).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(isReachabilityFailure(null)).toBe(false);
    expect(isReachabilityFailure(undefined)).toBe(false);
  });
});

describe('ProviderHealth', () => {
  it('lets requests through while the endpoint is answering', () => {
    const health = new ProviderHealth({ cooldownMs: 60_000 });
    expect(() => health.assertAvailable()).not.toThrow();
    expect(health.snapshot().state).toBe('ready');
  });

  it('opens after a reachability failure and fails fast from then on', () => {
    const clock = fixedClock();
    const health = new ProviderHealth({ cooldownMs: 60_000, now: clock.now });

    health.recordFailure(connectionRefused());

    expect(() => health.assertAvailable()).toThrow(ProviderUnavailableError);
    expect(health.snapshot().state).toBe('unreachable');
  });

  it('stays closed for a failure that is not about reachability', () => {
    const health = new ProviderHealth({ cooldownMs: 60_000 });
    health.recordFailure(Object.assign(new Error('Incorrect API key'), { status: 401 }));

    expect(() => health.assertAvailable()).not.toThrow();
    expect(health.snapshot().state).toBe('ready');
  });

  it('lets exactly one probe through once the cooldown passes', () => {
    const clock = fixedClock();
    const health = new ProviderHealth({ cooldownMs: 60_000, now: clock.now });
    health.recordFailure(connectionRefused());

    clock.advance(59_999);
    expect(() => health.assertAvailable()).toThrow(ProviderUnavailableError);

    clock.advance(2);
    expect(() => health.assertAvailable()).not.toThrow();
  });

  it('restarts the cooldown from the probe, so a machine left off is asked once a minute', () => {
    const clock = fixedClock();
    const health = new ProviderHealth({ cooldownMs: 60_000, now: clock.now });

    health.recordFailure(connectionRefused());
    clock.advance(60_001);
    health.recordFailure(connectionRefused()); // the probe fails too

    expect(() => health.assertAvailable()).toThrow(ProviderUnavailableError);
    clock.advance(60_001);
    expect(() => health.assertAvailable()).not.toThrow();
  });

  it('closes the moment the endpoint answers again', () => {
    const clock = fixedClock();
    const health = new ProviderHealth({ cooldownMs: 60_000, now: clock.now });
    health.recordFailure(connectionRefused());

    clock.advance(60_001);
    health.recordSuccess();

    expect(() => health.assertAvailable()).not.toThrow();
    expect(health.snapshot()).toMatchObject({ state: 'ready', consecutiveFailures: 0, retryAt: null });
  });

  it('honours a threshold above one when a caller wants to tolerate a blip', () => {
    const clock = fixedClock();
    const health = new ProviderHealth({ cooldownMs: 60_000, threshold: 3, now: clock.now });

    health.recordFailure(connectionRefused());
    health.recordFailure(connectionRefused());
    expect(() => health.assertAvailable()).not.toThrow();

    health.recordFailure(connectionRefused());
    expect(() => health.assertAvailable()).toThrow(ProviderUnavailableError);
  });

  it('reports when it will next try, so the log says more than "unavailable"', () => {
    const clock = fixedClock();
    const health = new ProviderHealth({ cooldownMs: 60_000, now: clock.now });
    health.recordFailure(connectionRefused());

    const snapshot = health.snapshot();
    expect(snapshot.retryAt?.getTime()).toBe(clock.now() + 60_000);
    expect(snapshot.lastError).toContain('ECONNREFUSED');
    expect(snapshot.consecutiveFailures).toBe(1);
  });

  it('throws a typed error carrying the retry time, so a log line says more than "unavailable"', () => {
    // A distinct class because "we did not try" and "we tried and it failed" mean
    // different things in a log, even though the user sees the same graceful fallback.
    // The message names the endpoint's own error and never reaches a client: the chat
    // route catches it and logs it (api/_routes/chat.ts § onProviderFailure).
    const clock = fixedClock();
    const health = new ProviderHealth({ cooldownMs: 60_000, now: clock.now });
    health.recordFailure(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:11434'), { code: 'ECONNREFUSED' }),
    );

    const error = (() => {
      try {
        health.assertAvailable();
        return null;
      } catch (err) {
        return err as ProviderUnavailableError;
      }
    })();

    expect(error).toBeInstanceOf(ProviderUnavailableError);
    expect(error!.retryAt.getTime()).toBe(clock.now() + 60_000);
    expect(error!.message).toContain('ECONNREFUSED');
  });
});
