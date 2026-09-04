/**
 * /api/commitments — the commitments umbrella (PROGRESS.md Phase 4): tasks, reminders
 * and important dates. PAYMENT commitments are created through /api/finance, because a
 * payment only ever exists alongside a financial obligation.
 *
 * user_id comes from the verified token, never the request
 * (.claude/rules/auth-security.md).
 */

import { z } from 'zod';
import {
  commitmentsService,
  getSupabaseServiceClient,
  type ApiSuccessBody,
  type CommitmentView,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:MM');

const listQuerySchema = z.object({
  type: z.enum(['TASK', 'REMINDER', 'IMPORTANT_DATE', 'PAYMENT']).optional(),
  status: z.enum(['pending', 'done', 'cancelled']).optional(),
  dueBefore: isoDate.optional(),
  dueFrom: isoDate.optional(),
});

const createSchema = z.object({
  // PAYMENT is absent on purpose — see the finance service's create guard.
  type: z.enum(['TASK', 'REMINDER', 'IMPORTANT_DATE']),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  dueDate: isoDate.optional(),
  dueTime: isoTime.optional(),
  recurrenceRule: z.string().max(120).optional(),
  leadDays: z.number().int().min(0).max(365).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export default withApiHandler(async (req, res, ctx) => {
  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Invalid query parameters.');

    const commitments = await commitmentsService.list(
      client,
      ctx.user.id,
      parsed.data,
      now,
      ctx.user.timezone,
    );
    const body: ApiSuccessBody<CommitmentView[]> = { data: commitments };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'A commitment needs a type and a title.');

    const created = await commitmentsService.create(client, ctx.user.id, parsed.data);
    const body: ApiSuccessBody<CommitmentView> = {
      data: commitmentsService.toView(created, commitmentsService.today(now, ctx.user.timezone)),
    };
    res.status(201).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/commitments.`);
});
