/**
 * withApiHandler — every /api/* function is wrapped in this. It builds the verified
 * request context, and converts any thrown error (ApiError or otherwise) into the one
 * error contract, logged with the request id (.claude/rules/auth-security.md).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { buildRequestContext, type RequestContext } from './context';
import { normalizeError, toErrorBody } from './errors';
import { createLogger } from './logger';

export type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse,
  ctx: RequestContext,
) => Promise<void>;

export function withApiHandler(fn: ApiHandler) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    const requestId = randomUUID();

    try {
      const ctx = await buildRequestContext(req, requestId);
      await fn(req, res, ctx);
    } catch (err) {
      const apiError = normalizeError(err);
      // Context couldn't be built (e.g. auth failure), so log without a resolved userId.
      const logger = createLogger({ requestId });
      logger.error(apiError.message, { code: apiError.code, status: apiError.status });
      res.status(apiError.status).json(toErrorBody(apiError, requestId));
    }
  };
}
