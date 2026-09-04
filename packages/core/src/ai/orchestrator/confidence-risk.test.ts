import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_THRESHOLD,
  decide,
  decideTurn,
  hasMonetaryArgument,
  requiresSourceConfirmation,
} from './confidence-risk';

describe('decide (ai-pipeline.md § Confidence and confirmation)', () => {
  it('clarifies below the confidence threshold, regardless of risk', () => {
    expect(decide(CONFIDENCE_THRESHOLD - 0.01, false)).toBe('clarify');
    expect(decide(0, true)).toBe('clarify');
  });

  it('confirms a high-impact write even at full confidence', () => {
    expect(decide(1, true)).toBe('confirm');
  });

  it('proceeds directly for a confident, low-risk request', () => {
    expect(decide(1, false)).toBe('proceed');
    expect(decide(CONFIDENCE_THRESHOLD, false)).toBe('proceed');
  });
});

describe('voice source gate (ai-pipeline.md: any monetary amount from voice)', () => {
  it('finds a monetary argument under any of its names', () => {
    expect(hasMonetaryArgument({ amount: 42500 })).toBe(true);
    expect(hasMonetaryArgument({ paidAmount: '42500.00' })).toBe(true);
    expect(hasMonetaryArgument({ expectedAmount: 100 })).toBe(true);
  });

  it('does not treat a non-monetary argument as one', () => {
    expect(hasMonetaryArgument({ title: 'Call the electrician', dueDay: 5 })).toBe(false);
    expect(hasMonetaryArgument(null)).toBe(false);
    expect(hasMonetaryArgument({})).toBe(false);
  });

  it('ignores an empty amount string rather than confirming on nothing', () => {
    expect(hasMonetaryArgument({ amount: '  ' })).toBe(false);
  });

  it('always confirms a spoken amount, even for a low-impact intent', () => {
    expect(requiresSourceConfirmation('voice', { amount: 42500 })).toBe(true);
  });

  it('does not confirm a spoken turn that carries no amount', () => {
    expect(requiresSourceConfirmation('voice', { title: 'Call the electrician' })).toBe(false);
  });

  it('does not confirm a typed amount on that basis alone — the intent gate decides', () => {
    expect(requiresSourceConfirmation('chat', { amount: 42500 })).toBe(false);
  });

  it('always confirms anything derived from pasted content', () => {
    expect(requiresSourceConfirmation('paste', { title: 'anything' })).toBe(true);
  });
});

describe('decideTurn', () => {
  const base = { confidence: 0.9, isHighImpact: false, source: 'chat' as const, args: {} };

  it('proceeds on a confident, low-impact, typed turn', () => {
    expect(decideTurn(base)).toBe('proceed');
  });

  it('clarifies on low confidence regardless of anything else', () => {
    expect(decideTurn({ ...base, confidence: 0.2, isHighImpact: true })).toBe('clarify');
  });

  it('confirms a high-impact intent even at full confidence', () => {
    expect(decideTurn({ ...base, confidence: 1, isHighImpact: true })).toBe('confirm');
  });

  it('confirms a spoken amount on an otherwise low-impact intent', () => {
    expect(decideTurn({ ...base, source: 'voice', args: { amount: 42500 } })).toBe('confirm');
  });

  it('lets a spoken turn without an amount proceed', () => {
    expect(decideTurn({ ...base, source: 'voice', args: { title: 'Call Ashok' } })).toBe('proceed');
  });

  it('clarifies an unsettled relative date ahead of every other gate', () => {
    expect(
      decideTurn({ ...base, confidence: 1, isHighImpact: true, hasUnresolvedRelativeDate: true }),
    ).toBe('clarify');
  });
});
