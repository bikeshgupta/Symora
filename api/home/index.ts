/**
 * GET /api/home — everything the personalized home screen renders (PROGRESS.md Phase 6).
 *
 * One request, because the home screen is a single glance: firing five parallel queries
 * from the client would make the page assemble itself piecemeal, which is exactly the
 * "generic dashboard" feel the requirements rule out.
 *
 * Every value here is computed deterministically server-side. The client renders it
 * through the trusted component allowlist and never derives a total of its own.
 */

import { getSupabaseServiceClient, homeService, type ApiSuccessBody, type HomePayload } from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'GET') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/home.`);
  }

  const home = await homeService.getHome(
    getSupabaseServiceClient(),
    { id: ctx.user.id, displayName: ctx.user.displayName, timezone: ctx.user.timezone },
    new Date(),
  );

  const body: ApiSuccessBody<HomePayload> = { data: home };
  res.status(200).json(body);
});
