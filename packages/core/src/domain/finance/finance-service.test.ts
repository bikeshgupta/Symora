import { describe, expect, it } from 'vitest';
import { decidePaidUpdate } from './finance-service';

const pendingInstance = {
  status: 'pending' as const,
  paidAmount: null,
  paidDate: null,
  expectedAmount: '42500.00',
};

describe('decidePaidUpdate (finance-rules.md § Idempotency)', () => {
  it('marks a pending instance paid in full', () => {
    const decision = decidePaidUpdate(pendingInstance, 42500, '2026-09-05');
    expect(decision).toEqual({ action: 'update', status: 'paid', wasCorrection: false });
  });

  it('marks a partial payment when the amount is less than expected', () => {
    const decision = decidePaidUpdate(pendingInstance, 20000, '2026-09-05');
    expect(decision.status).toBe('partial');
  });

  it('is a no-op when re-marking an already-paid instance with the same amount and date', () => {
    const paidInstance = { ...pendingInstance, status: 'paid' as const, paidAmount: '42500.00', paidDate: '2026-09-05' };
    const decision = decidePaidUpdate(paidInstance, 42500, '2026-09-05');
    expect(decision.action).toBe('noop');
  });

  it('is a correction, not a no-op, when the amount differs from what was already recorded', () => {
    const paidInstance = { ...pendingInstance, status: 'paid' as const, paidAmount: '42500.00', paidDate: '2026-09-05' };
    const decision = decidePaidUpdate(paidInstance, 40000, '2026-09-05');
    expect(decision).toEqual({ action: 'update', status: 'partial', wasCorrection: true });
  });

  it('is a correction when the date differs even if the amount matches', () => {
    const paidInstance = { ...pendingInstance, status: 'paid' as const, paidAmount: '42500.00', paidDate: '2026-09-05' };
    const decision = decidePaidUpdate(paidInstance, 42500, '2026-09-06');
    expect(decision).toEqual({ action: 'update', status: 'paid', wasCorrection: true });
  });
});
