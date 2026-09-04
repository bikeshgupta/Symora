/**
 * GET /api/finance — the whole finance picture for a period: what is required, what is
 * still outstanding, what is overdue, what is coming.
 *
 * Every number is derived from stored instances at read time, in the user's timezone.
 * Nothing is a cached column, so the same rows and the same instant always give the
 * same answer (.claude/rules/finance-rules.md § Determinism).
 */

import { z } from 'zod';
import {
  financeService,
  getSupabaseServiceClient,
  type ApiSuccessBody,
  type FinanceSummary,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const querySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM').optional(),
});

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'GET') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/finance.`);
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'period must look like 2026-09.');

  const summary = await financeService.getSummary(
    getSupabaseServiceClient(),
    ctx.user.id,
    new Date(),
    ctx.user.timezone,
    parsed.data.period,
  );

  const body: ApiSuccessBody<FinanceSummary> = { data: summary };
  res.status(200).json(body);
});
