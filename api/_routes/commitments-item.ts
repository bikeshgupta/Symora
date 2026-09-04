/**
 * /api/commitments/:id — update, complete, reschedule or cancel one commitment.
 *
 * DELETE cancels rather than removing the row: a cancelled commitment is history, and a
 * PAYMENT commitment owns financial instances that must outlive it
 * (.claude/rules/finance-rules.md). Another user's commitment is a 404, never a 403.
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

const patchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(2000).nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    dueTime: isoTime.nullable().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    status: z.enum(['pending', 'done', 'cancelled']).optional(),
    leadDays: z.number().int().min(0).max(365).nullable().optional(),
    recurrenceRule: z.string().max(120).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to change.' });

export default withApiHandler(async (req, res, ctx) => {
  const id = z.string().uuid().safeParse(req.query.id);
  if (!id.success) throw new ApiError('NOT_FOUND', 'Commitment not found.');

  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const commitment = await commitmentsService.getById(client, ctx.user.id, id.data, now, ctx.user.timezone);
    if (!commitment) throw new ApiError('NOT_FOUND', 'Commitment not found.');

    const body: ApiSuccessBody<CommitmentView> = { data: commitment };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Nothing valid to change.');

    const updated = await commitmentsService.update(
      client,
      ctx.user.id,
      id.data,
      parsed.data,
      now,
      ctx.user.timezone,
    );
    if (!updated) throw new ApiError('NOT_FOUND', 'Commitment not found.');

    const body: ApiSuccessBody<CommitmentView> = { data: updated };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const cancelled = await commitmentsService.cancel(client, ctx.user.id, id.data, now, ctx.user.timezone);
    if (!cancelled) throw new ApiError('NOT_FOUND', 'Commitment not found.');

    const body: ApiSuccessBody<CommitmentView> = { data: cancelled };
    res.status(200).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/commitments/:id.`);
});
