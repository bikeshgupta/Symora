/**
 * POST /api/privacy/delete — delete the caller's account and all their data
 * (PROGRESS.md Phase 8).
 *
 * Irreversible, so it requires an explicit typed confirmation in the body rather than
 * being a bare button press away. The delete cascades from the `users` row across every
 * user-owned table, so it is atomic — a partial deletion leaving orphaned personal data
 * is the one outcome this must never produce.
 *
 * The Firebase auth user is not removed here; the client signs out afterwards, and the
 * next sign-in would provision a fresh empty row rather than restoring anything.
 */

import { z } from 'zod';
import {
  getSupabaseServiceClient,
  privacyService,
  type ApiSuccessBody,
  type DeletionResult,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const requestSchema = z.object({
  /** The user types this exactly; a mistyped value is a rejected request, not a delete. */
  confirmation: z.literal('DELETE'),
});

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'POST') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/privacy/delete.`);
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError('VALIDATION_ERROR', 'Type DELETE to confirm you want everything removed.');
  }

  ctx.logger.warn('account deletion requested');

  const result: DeletionResult = await privacyService.deleteAccount(
    getSupabaseServiceClient(),
    ctx.user.id,
    new Date(),
  );

  const body: ApiSuccessBody<DeletionResult> = { data: result };
  res.status(200).json(body);
});
