/**
 * The Supabase service-role client. Server-only — see .claude/rules/auth-security.md.
 * Bypasses RLS by design; every repository function using this client MUST filter
 * explicitly by user_id itself. RLS is the safety net for a bug here, not a substitute.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

/**
 * How long a single database request may take before it is abandoned.
 *
 * supabase-js calls `fetch` with no timeout of its own, which made this the last
 * unbounded wait in the stack: a project that is paused, a wrong URL, or a network that
 * drops the connection produces a request that simply never settles. The serverless
 * function then hits the platform's own ceiling and is killed — and a killed invocation
 * returns the platform's error page, not Symora's error contract, so there is no code, no
 * request id, and nothing in the response anyone can act on. Every route that touches the
 * database fails that way at once, which reads as "the whole app is broken" rather than
 * "the database is not answering".
 *
 * Eight seconds is far longer than a healthy Postgres round trip and comfortably inside
 * the function's budget, so a slow query still succeeds and a hung one becomes an
 * ordinary error the middleware can report properly.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

function requestTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SUPABASE_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
}

/**
 * `fetch` with a deadline, and a message that says what timed out.
 *
 * The caller's own abort signal is preserved rather than replaced — supabase-js exposes
 * `.abortSignal()` and silently dropping it would be a worse bug than the one this fixes.
 * Exported for its test; the client below is what everything uses.
 */
export function createTimedFetch(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal =
      init?.signal && typeof AbortSignal.any === 'function'
        ? AbortSignal.any([init.signal, controller.signal])
        : (init?.signal ?? controller.signal);

    try {
      return await fetchImpl(input, { ...init, signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `The database did not respond within ${timeoutMs}ms. It may be paused, ` +
            'unreachable, or SUPABASE_URL may be wrong.',
          { cause: error },
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function getSupabaseServiceClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Never fall back to a ' +
        'default or anonymous client for server-side data access.',
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createTimedFetch(fetch, requestTimeoutMs()) },
  });
  return cachedClient;
}

/** Test-only: drop the cached client so a changed URL or timeout is picked up. */
export function resetSupabaseServiceClient(): void {
  cachedClient = null;
}
