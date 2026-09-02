import { describe, expect, it } from 'vitest';
import { createFinancialObligationArgs, markDoneArgs, markPaidArgs } from './intents';

describe('intent arg schemas reject malformed model output', () => {
  it('mark_paid requires either accountName or obligationId', () => {
    expect(markPaidArgs.safeParse({}).success).toBe(false);
    expect(markPaidArgs.safeParse({ accountName: 'Home loan' }).success).toBe(true);
  });

  it('mark_done requires either commitmentId or title', () => {
    expect(markDoneArgs.safeParse({}).success).toBe(false);
    expect(markDoneArgs.safeParse({ title: 'Call electrician' }).success).toBe(true);
  });

  it('create_financial_obligation rejects a non-positive amount and an out-of-range due day', () => {
    const base = { accountName: 'Home loan', obligationType: 'emi' as const, currency: 'INR', recurrenceRule: 'monthly' };
    expect(createFinancialObligationArgs.safeParse({ ...base, amount: -100, dueDay: 5 }).success).toBe(false);
    expect(createFinancialObligationArgs.safeParse({ ...base, amount: 42500, dueDay: 45 }).success).toBe(false);
    expect(createFinancialObligationArgs.safeParse({ ...base, amount: 42500, dueDay: 5 }).success).toBe(true);
  });
});
