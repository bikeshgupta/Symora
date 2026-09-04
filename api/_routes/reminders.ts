/**
 * /api/reminders — reminders are commitments of type REMINDER. `leadDays` is what makes
 * "remind me 2 days before" work; the fire date is computed from due date + lead time
 * and never stored (see domain/commitments/recurrence.ts).
 */

import { z } from 'zod';
import {
  commitmentsService,
  getSupabaseServiceClient,
  remindersService,
  type ApiSuccessBody,
  type CommitmentView,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:MM');

const listQuerySchema = z.object({
  status: z.enum(['pending', 'done', 'cancelled']).optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(300),
  dueDate: isoDate.optional(),
  dueTime: isoTime.optional(),
  recurrenceRule: z.string().max(120).optional(),
  leadDays: z.number().int().min(0).max(365).optional(),
});

export default withApiHandler(async (req, res, ctx) => {
  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Invalid query parameters.');

    const reminders = await remindersService.list(client, ctx.user.id, parsed.data, now, ctx.user.timezone);
    const body: ApiSuccessBody<CommitmentView[]> = { data: reminders };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'A reminder needs a title.');

    const created = await remindersService.create(client, ctx.user.id, parsed.data);
    const body: ApiSuccessBody<CommitmentView> = {
      data: commitmentsService.toView(created, commitmentsService.today(now, ctx.user.timezone)),
    };
    res.status(201).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/reminders.`);
});
