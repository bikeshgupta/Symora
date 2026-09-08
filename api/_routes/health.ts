/**
 * GET /api/health — which of Symora's dependencies are actually answering.
 *
 * This exists because of a real afternoon lost to it: every request was coming back as
 * the platform's own error page, which carries no code, no request id and no clue, and
 * from outside there was no way to tell a paused database from a missing table from a
 * bad key. The logs know, but a user looking at a broken app does not have the logs.
 *
 * Two rules keep it from becoming a leak (.claude/rules/auth-security.md § Errors):
 *
 * 1. **It requires a verified token.** Deployment state is not public.
 * 2. **It reports states, never details.** `unreachable` and `schema_incomplete`, never
 *    the database URL, the failing table, the driver's message, or any row. The detail
 *    goes to the server log, where it belongs.
 *
 * It deliberately does not use `withApiHandler`: that middleware resolves the caller to a
 * `users.id` first, which is itself a database read, so a broken database would fail the
 * one endpoint whose whole job is to say the database is broken. The token is verified
 * here directly instead — no user row is needed to answer "is Postgres answering?".
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import {
  getProviderHealth,
  getRuntimeCapabilities,
  getSupabaseServiceClient,
  healthRepository,
  PROBED_TABLES,
} from '@symora/core';
import { verifyBearerToken } from '../_middleware/firebase-admin';
import { normalizeError, toErrorBody } from '../_middleware/errors';
import { createLogger } from '../_middleware/logger';

type DatabaseState = 'ok' | 'unreachable' | 'schema_incomplete';

export interface HealthResponse {
  database: DatabaseState;
  /** How many of the expected tables answered. Counts only — never which ones. */
  tables: { answered: number; expected: number };
  model: {
    mode: 'ai' | 'offline';
    status: 'offline' | 'ready' | 'unreachable' | 'rate_limited';
    provider: string;
  };
  checkedAt: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const requestId = randomUUID();
  const logger = createLogger({ requestId });

  try {
    if (req.method !== 'GET') {
      res.status(405).json({
        error: { code: 'METHOD_NOT_ALLOWED', message: `${req.method} is not allowed on /api/health.`, requestId },
      });
      return;
    }

    await verifyBearerToken(req.headers.authorization);

    // The query itself lives in the repository layer, where every query does
    // (packages/core/src/repositories/health-repository.ts).
    const probe = await healthRepository.probeTables(getSupabaseServiceClient());
    const answered = probe.probes.filter((row) => row.answered).length;

    if (probe.unreachable) {
      // A throw rather than an error row means the driver never got a reply at all: the
      // project is paused, the URL is wrong, or the request timed out.
      logger.error('The database did not answer.', { cause: probe.unreachable.detail });
    }
    for (const row of probe.probes) {
      // The failing table and the driver's words go to the log, never to the response.
      if (!row.answered) logger.warn('A required table did not answer.', { table: row.table, cause: row.detail });
    }

    const providerHealth = getProviderHealth();
    const capabilities = getRuntimeCapabilities(process.env, {
      modelReachable: providerHealth.state === 'ready',
      modelRateLimited: providerHealth.state === 'rate_limited',
    });

    const database: DatabaseState = probe.unreachable
      ? 'unreachable'
      : answered === PROBED_TABLES.length
        ? 'ok'
        : 'schema_incomplete';

    logger.info('Health check.', { database, answered, expected: PROBED_TABLES.length });

    const body: { data: HealthResponse } = {
      data: {
        database,
        tables: { answered, expected: PROBED_TABLES.length },
        model: {
          mode: capabilities.aiMode,
          status: capabilities.modelStatus,
          provider: capabilities.modelProvider,
        },
        checkedAt: new Date().toISOString(),
      },
    };
    res.status(200).json(body);
  } catch (err) {
    const apiError = normalizeError(err);
    logger.error(apiError.message, { code: apiError.code });
    if (!res.headersSent) res.status(apiError.status).json(toErrorBody(apiError, requestId));
  }
}
