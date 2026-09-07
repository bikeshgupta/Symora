/**
 * withApiHandler — every /api/* function is wrapped in this. It builds the verified
 * request context, and converts any thrown error (ApiError or otherwise) into the one
 * error contract, logged with the request id (.claude/rules/auth-security.md).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { auditRepository, getSupabaseServiceClient } from '@symora/core';
import { buildRequestContext, type RequestContext } from './context';
import { ApiError, normalizeError, toErrorBody } from './errors';
import { createLogger } from './logger';

export type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse,
  ctx: RequestContext,
) => Promise<void>;

/**
 * Failures that mean "you asked for something that is not yours to have".
 *
 * NOT_FOUND is in here on purpose. A row belonging to another user is answered as a 404
 * precisely so its existence does not leak (auth-security.md § User isolation), which
 * means by the time an error reaches here, a denied access and a genuinely missing row
 * are indistinguishable — deliberately. Auditing both over-reports and never
 * under-reports, and the pattern an audit trail exists to surface, a caller walking uuids
 * across item routes, looks the same either way.
 */
const AUDITABLE_CODES = new Set(['NOT_FOUND', 'FORBIDDEN']);

/**
 * Records the denial. Best-effort by design: an audit write that failed must not turn a
 * clean 404 into a 500, so it is logged and swallowed rather than rethrown. The event is
 * also written to the request log, so a database problem here does not lose the signal
 * entirely.
 */
async function auditDenial(
  ctx: RequestContext,
  req: VercelRequest,
  error: ApiError,
): Promise<void> {
  try {
    await auditRepository.recordAuditEvent(getSupabaseServiceClient(), {
      userId: ctx.user.id,
      action: 'access_denied',
      // The path, never the body: a request body can carry memory or message content.
      detail: { code: error.code, method: req.method ?? 'UNKNOWN', path: req.url ?? 'unknown' },
      targetId: typeof req.query.id === 'string' ? req.query.id : null,
      requestId: ctx.requestId,
    });
  } catch (auditError) {
    ctx.logger.error('Failed to record an access_denied audit event.', {
      cause: auditError instanceof Error ? auditError.message : String(auditError),
    });
  }
}

/**
 * How long a request may take before the API answers for it.
 *
 * Deliberately under `maxDuration` in vercel.json. Past that ceiling the platform kills
 * the invocation and returns its own error page: not Symora's error contract, no request
 * id, no log line naming what hung, and — since nothing in this process ever learns the
 * request failed — no circuit breaker opening and no fallback taken. The whole reason to
 * answer first is that an honest 504 with a code is diagnosable and a killed function is
 * not.
 *
 * This is the outer net, not the plan: the pipeline's own budget
 * (packages/core/src/ai/orchestrator/turn-budget.ts) should degrade to a real answer
 * well before this fires. Reaching it means something hung that nobody bounded.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;

function requestTimeoutMs(): number {
  const raw = process.env.API_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REQUEST_TIMEOUT_MS;
}

export function withApiHandler(fn: ApiHandler) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const requestId = randomUUID();
    // Held outside the try so the catch below knows whether the caller was ever
    // identified — an unauthenticated request has nobody to attribute an audit row to.
    let ctx: RequestContext | null = null;

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      ctx = await buildRequestContext(req, requestId);

      // The handler is raced against the deadline rather than cancelled at it: nothing
      // here can abort work already in flight, and pretending otherwise would be worse
      // than saying plainly that it took too long. The rejection the timer raises is
      // what reaches the catch below and becomes the one error contract.
      const handled = fn(req, res, ctx);
      // A handler that finishes *after* the deadline would otherwise reject into
      // nothing — an unhandled rejection, which takes the whole function down and turns
      // the honest 504 already sent into a platform error page for the next caller on
      // this instance.
      handled.catch(() => undefined);

      await Promise.race([
        handled,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ApiError('REQUEST_TIMEOUT', 'That took too long. Please try again.')),
            requestTimeoutMs(),
          );
        }),
      ]);
    } catch (err) {
      const apiError = normalizeError(err);
      // Prefer the context's logger once there is one, so the line carries the user id.
      const logger = ctx?.logger ?? createLogger({ requestId });
      const cause = apiError.cause;
      logger.error(apiError.message, {
        code: apiError.code,
        status: apiError.status,
        // The client only ever sees apiError.message; `cause` is the real underlying
        // reason (bad config, a driver error) and stays server-side, log-only.
        cause: cause instanceof Error ? cause.message : cause !== undefined ? String(cause) : undefined,
      });

      if (ctx && AUDITABLE_CODES.has(apiError.code)) {
        await auditDenial(ctx, req, apiError);
      }

      // A handler that already answered before throwing — a timeout losing a race it
      // narrowly won, say — must not be written to twice: the second write throws
      // inside the catch itself and crashes the invocation.
      if (!res.headersSent) {
        res.status(apiError.status).json(toErrorBody(apiError, requestId));
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
