import { describe, expect, it } from 'vitest';
import { CONFIDENCE_THRESHOLD, decide } from './confidence-risk';

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
