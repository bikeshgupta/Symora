import { describe, expect, it } from 'vitest';
import { getFeatureFlags } from './feature-flags';

describe('getFeatureFlags', () => {
  it('defaults every flag to false when unset', () => {
    expect(getFeatureFlags({})).toEqual({ voiceInput: false, notifications: false });
  });

  it('reads "true" and "1" as enabled, everything else as disabled', () => {
    expect(getFeatureFlags({ FEATURE_VOICE_INPUT: 'true' }).voiceInput).toBe(true);
    expect(getFeatureFlags({ FEATURE_VOICE_INPUT: '1' }).voiceInput).toBe(true);
    expect(getFeatureFlags({ FEATURE_VOICE_INPUT: 'yes' }).voiceInput).toBe(false);
    expect(getFeatureFlags({ FEATURE_NOTIFICATIONS: 'true' }).notifications).toBe(true);
  });
});
