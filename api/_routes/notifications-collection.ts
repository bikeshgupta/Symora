/**
 * /api/notifications — the notification inbox (PROGRESS.md Phase 8).
 *
 * GET generates anything due as of today and then returns the inbox. Generation happens
 * on read because V1 has no scheduler: the app catches up whenever the user opens it. It
 * is idempotent via the unique dedupe key, so a background job can call the same service
 * later without producing duplicates.
 *
 * PATCH marks everything read.
 */

import {
  getSupabaseServiceClient,
  notificationService,
  type ApiSuccessBody,
  type NotificationInbox,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

export default withApiHandler(async (req, res, ctx) => {
  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const inbox = await notificationService.getInbox(client, ctx.user.id, now, ctx.user.timezone);
    const body: ApiSuccessBody<NotificationInbox> = { data: inbox };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'PATCH') {
    const updated = await notificationService.markAllRead(client, ctx.user.id);
    const body: ApiSuccessBody<{ updated: number }> = { data: { updated } };
    res.status(200).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/notifications.`);
});
