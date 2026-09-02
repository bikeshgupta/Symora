/**
 * GET /api/me — returns the verified caller's own user row. Never accepts a user id
 * from the request; it comes entirely from the verified Firebase token via
 * buildRequestContext. See .claude/rules/auth-security.md.
 */

import type { ApiSuccessBody, UserRecord } from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'GET') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/me.`);
  }

  const body: ApiSuccessBody<UserRecord> = { data: ctx.user };
  res.status(200).json(body);
});
