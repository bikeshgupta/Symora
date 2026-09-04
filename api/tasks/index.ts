/**
 * /api/tasks — tasks are commitments of type TASK (.claude/rules/data-model.md), so
 * this is a filtered view over the same service rather than a parallel implementation.
 * Updating, completing and rescheduling a task go through /api/commitments/:id.
 */

import { z } from 'zod';
import {
  getSupabaseServiceClient,
  tasksService,
  commitmentsService,
  type ApiSuccessBody,
  type CommitmentView,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:MM');

const listQuerySchema = z.object({
  status: z.enum(['pending', 'done', 'cancelled']).optional(),
  dueBefore: isoDate.optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  dueDate: isoDate.optional(),
  dueTime: isoTime.optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export default withApiHandler(async (req, res, ctx) => {
  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'Invalid query parameters.');

    const tasks = await tasksService.list(client, ctx.user.id, parsed.data, now, ctx.user.timezone);
    const body: ApiSuccessBody<CommitmentView[]> = { data: tasks };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'A task needs a title.');

    const created = await tasksService.create(client, ctx.user.id, parsed.data);
    const body: ApiSuccessBody<CommitmentView> = {
      data: commitmentsService.toView(created, commitmentsService.today(now, ctx.user.timezone)),
    };
    res.status(201).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/tasks.`);
});
