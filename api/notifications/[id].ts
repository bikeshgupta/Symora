/**
 * PATCH /api/notifications/:id — mark one notification read or dismissed.
 *
 * Another user's notification is a 404, never a 403 (.claude/rules/auth-security.md).
 */

import { z } from 'zod';
import {
  getSupabaseServiceClient,
  notificationService,
  type ApiSuccessBody,
  type NotificationRecord,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const patchSchema = z.object({ status: z.enum(['pending', 'read', 'dismissed']) });

export default withApiHandler(async (req, res, ctx) => {
  if (req.method !== 'PATCH') {
    throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/notifications/:id.`);
  }

  const id = z.string().uuid().safeParse(req.query.id);
  if (!id.success) throw new ApiError('NOT_FOUND', 'Notification not found.');

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'A valid status is required.');

  const updated = await notificationService.setStatus(
    getSupabaseServiceClient(),
    ctx.user.id,
    id.data,
    parsed.data.status,
  );
  if (!updated) throw new ApiError('NOT_FOUND', 'Notification not found.');

  const body: ApiSuccessBody<NotificationRecord> = { data: updated };
  res.status(200).json(body);
});
