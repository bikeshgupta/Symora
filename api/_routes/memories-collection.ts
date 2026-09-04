/**
 * /api/memories — "What Symora knows about me" (PROGRESS.md Phase 3).
 *
 * GET  lists the memories in effect for the caller, newest window first.
 * POST records one explicitly.
 *
 * The user id is never read from the request; it comes from the verified token via
 * buildRequestContext (.claude/rules/auth-security.md).
 */

import { z } from 'zod';
import {
  getSupabaseServiceClient,
  MEMORY_TYPES,
  memoryService,
  type ApiSuccessBody,
  type MemoryType,
  type MemoryView,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const listQuerySchema = z.object({
  includeSuperseded: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  memoryType: z.enum(MEMORY_TYPES as [MemoryType, ...MemoryType[]]).optional(),
});

const createSchema = z.object({
  key: z.string().min(1).max(120),
  text: z.string().min(1).max(2000),
  memoryType: z.enum(MEMORY_TYPES as [MemoryType, ...MemoryType[]]).default('preference'),
});

export default withApiHandler(async (req, res, ctx) => {
  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid query parameters.');
    }

    const memories = await memoryService.listMemories(client, ctx.user.id, now, ctx.user.timezone, {
      includeSuperseded: parsed.data.includeSuperseded,
      memoryType: parsed.data.memoryType,
    });

    const body: ApiSuccessBody<MemoryView[]> = { data: memories };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'A memory needs a key and some text.');
    }

    const result = await memoryService.remember(
      client,
      ctx.user.id,
      {
        memoryType: parsed.data.memoryType,
        key: parsed.data.key,
        text: parsed.data.text,
        // Typed into the memory screen by hand, so it is stated, not inferred.
        source: 'user_stated',
      },
      now,
      ctx.user.timezone,
    );

    const body: ApiSuccessBody<MemoryView> = {
      data: memoryService.toView(result.memory, memoryService.asOfDate(now, ctx.user.timezone)),
    };
    res.status(result.outcome === 'unchanged' ? 200 : 201).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/memories.`);
});
