/**
 * Feature flags (.claude/rules design + PROGRESS.md Phase 1). Future/optional
 * capabilities stay behind an explicit flag, off by default, read from server-only env
 * vars — never trust a client-supplied flag value. See CLAUDE.md principle 9.
 */

export interface FeatureFlags {
  voiceInput: boolean;
  notifications: boolean;
}

function readBooleanFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

export function getFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return {
    voiceInput: readBooleanFlag(env.FEATURE_VOICE_INPUT),
    notifications: readBooleanFlag(env.FEATURE_NOTIFICATIONS),
  };
}
