/**
 * /api/finance/obligations — the recurring *definitions* (.claude/rules/finance-rules.md
 * § The central separation). Creating one seeds the next few periods' instances so
 * "what's coming up" is answerable immediately.
 *
 * Nothing here records a payment. Payment state lives on instances and is written
 * through /api/finance/instances — conflating the two is the mistake the rules file
 * calls the single most damaging one in this domain.
 */

import { z } from 'zod';
import {
  financeService,
  getSupabaseServiceClient,
  type ApiSuccessBody,
  type FinancialObligationRecord,
} from '@symora/core';
import { ApiError } from '../_middleware/errors';
import { withApiHandler } from '../_middleware/handler';

const createSchema = z.object({
  accountName: z.string().min(1).max(200),
  obligationType: z.enum(['emi', 'rent', 'bill', 'subscription', 'insurance', 'other']),
  // Kept as a number at the boundary and converted to exact minor units downstream;
  // never used in floating-point arithmetic (finance-rules.md § Determinism).
  amount: z.number().positive().max(1_000_000_000),
  currency: z.string().length(3).default('INR'),
  dueDay: z.number().int().min(1).max(31),
  recurrenceRule: z.string().max(120).optional(),
});

export default withApiHandler(async (req, res, ctx) => {
  const client = getSupabaseServiceClient();
  const now = new Date();

  if (req.method === 'GET') {
    const obligations = await financeService.listObligations(client, ctx.user.id);
    const body: ApiSuccessBody<FinancialObligationRecord[]> = { data: obligations };
    res.status(200).json(body);
    return;
  }

  if (req.method === 'POST') {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', 'An obligation needs a name, type, amount and due day.');
    }

    const result = await financeService.createObligationWithWindow(
      client,
      ctx.user.id,
      parsed.data,
      now,
      ctx.user.timezone,
    );
    const body: ApiSuccessBody<FinancialObligationRecord> = { data: result.obligation };
    res.status(201).json(body);
    return;
  }

  throw new ApiError('METHOD_NOT_ALLOWED', `${req.method} is not allowed on /api/finance/obligations.`);
});
