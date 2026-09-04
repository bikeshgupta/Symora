/**
 * /api/memories/:id — edit or delete one memory (PROGRESS.md Phase 3, and the privacy
 * commitment that a user can edit or delete anything Symora knows about them).
 *
 * A memory belonging to another user is a 404, never a 403 — an existence leak is still
 * a leak (.claude/rules/auth-security.md § User isolation).
 */

import { z } from 'zod';
import {
  getSupabaseServiceClient,
  memoryService,
  type ApiSuccessBody,
  type MemoryView,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const patchSchema = z
  .object({
    key: z.string().min(1).max(120).optional(),
    text: z.string().min(1).max(2000).optional(),
  })
  .refine((value) => value.key !== undefined || value.text !== undefined, {
    message: 'Provide a key or text to change.',
  });

export default withApiHandler(async (req, res, ctx) => {
  const id = z.string().uuid().safeParse(req.query.id);
  if (!id.success) {
    throw new ApiError('NOT_FOUND', 'Memory not found.');
  }

  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'Provide a key or text to change.');
    }

    const updated = await memoryService.editMemory(
      client,
      ctx.user.id,
      id.data,
      parsed.data,
      now,
      ctx.user.timezone,
    );
    if (!updated) throw new ApiError('NOT_FOUND', 'Memory not found.');

    const body: ApiSuccessBody<MemoryView> = { data: updated };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'DELETE') {
    const deleted = await memoryService.deleteMemory(client, ctx.user.id, id.data);
    if (!deleted) throw new ApiError('NOT_FOUND', 'Memory not found.');

    const body: ApiSuccessBody<{ id: string }> = { data: { id: id.data } };
    res.status(200).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/memories/:id.`);
});
