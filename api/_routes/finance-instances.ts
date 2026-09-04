/**
 * /api/finance/instances — one occurrence of an obligation in one period. This is where
 * payment state lives and the only place it is written
 * (.claude/rules/finance-rules.md: "Marking a payment writes to an instance, never to
 * the obligation").
 *
 * PATCH is idempotent by design: re-marking the same amount and date is a no-op success
 * rather than a duplicate or an error, and a different amount is treated as a
 * correction. That rule lives in decidePaidUpdate, not here.
 */

import { z } from 'zod';
import {
  financeService,
  getSupabaseServiceClient,
  type ApiSuccessBody,
  type FinancialInstanceRecord,
  type InstanceView,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const listQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM').optional(),
});

const patchSchema = z.object({
  instanceId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000_000).optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export default withApiHandler(async (req, res, ctx) => {
  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'period must look like 2026-09.');

    const period = parsed.data.period ?? financeService.currentPeriod(now, ctx.user.timezone);
    const instances = await financeService.listInstances(client, ctx.user.id, period, now, ctx.user.timezone);
    const body: ApiSuccessBody<InstanceView[]> = { data: instances };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'PATCH') {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', 'An instance id is required.');

    const result = await financeService.markInstancePaid(
      client,
      ctx.user.id,
      parsed.data.instanceId,
      { amount: parsed.data.amount, paidDate: parsed.data.paidDate },
      now,
      ctx.user.timezone,
    );

    // A row that exists but belongs to another user resolves to not_found in the
    // repository, so this 404 does not leak its existence either way.
    if (result.status === 'not_found') throw new ApiError('NOT_FOUND', 'Payment not found.');

    const body: ApiSuccessBody<FinancialInstanceRecord> = { data: result.instance };
    res.status(200).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/finance/instances.`);
});
