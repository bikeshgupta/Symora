/**
 * GET /api/me — returns the verified caller's own user row. Never accepts a user id
 * from the request; it comes entirely from the verified Firebase token via
 * buildRequestContext. See .claude/rules/auth-security.md.
 */

import {
  getRuntimeCapabilities,
  type ApiSuccessBody,
  type RuntimeCapabilities,
  type UserRecord,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

/**
 * The caller's own row plus what this deployment can actually do.
 *
 * Capabilities are derived from server configuration, never from the request, and they
 * only ever describe — the client uses them to label the experience honestly (templated
 * drafts, browser-side speech) rather than to unlock anything.
 */
export interface MeResponseBody extends UserRecord {
  capabilities: RuntimeCapabilities;
}

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'GET') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/me.`);
  }

  const body: ApiSuccessBody<MeResponseBody> = {
    data: { ...ctx.user, capabilities: getRuntimeCapabilities() },
  };
  res.status(200).json(body);
});
