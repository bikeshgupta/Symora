/**
 * GET /api/usage — AI requests, tokens, estimated cost, allowance and reset date
 * (PROGRESS.md Phase 8).
 *
 * On a deployment with no provider key the totals are legitimately zero: nothing calls a
 * model, so nothing is metered. The response says which mode it is in rather than
 * leaving a screen of zeroes looking broken.
 */

import {
  getAiMode,
  getSupabaseServiceClient,
  usageService,
  type ApiSuccessBody,
  type UsageSummary,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'GET') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/usage.`);
  }

  const usage = await usageService.getUsage(
    getSupabaseServiceClient(),
    ctx.user.id,
    new Date(),
    ctx.user.timezone,
    getAiMode(),
  );

  const body: ApiSuccessBody<UsageSummary> = { data: usage };
  res.status(200).json(body);
});
