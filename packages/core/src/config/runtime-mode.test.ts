import { describe, expect, it } from 'vitest';
import { getAiMode, getRuntimeCapabilities } from './runtime-mode';

describe('getAiMode', () => {
  it('is offline with no configuration at all', () => {
    expect(getAiMode({})).toBe('offline');
  });

  it('is offline with a key but no model configured', () => {
    // A key alone would fail on the first call; never leaving offline mode is better
    // than a deployment that looks configured and errors on every request.
    expect(getAiMode({ OPENAI_API_KEY: 'sk-test' })).toBe('offline');
  });

  it('is offline with a model but no key', () => {
    expect(getAiMode({ AI_MODEL_CHEAP: 'some-model' })).toBe('offline');
  });

  it('is ai only when both are present', () => {
    expect(getAiMode({ OPENAI_API_KEY: 'sk-test', AI_MODEL_CHEAP: 'some-model' })).toBe('ai');
  });
});

describe('getRuntimeCapabilities', () => {
  it('reports templated drafting and no server transcription when offline', () => {
    expect(getRuntimeCapabilities({})).toEqual({
      aiMode: 'offline',
      serverTranscription: false,
      draftingIsTemplated: true,
    });
  });

  it('reports full capability when configured', () => {
    expect(getRuntimeCapabilities({ OPENAI_API_KEY: 'sk-test', AI_MODEL_CHEAP: 'm' })).toEqual({
      aiMode: 'ai',
      serverTranscription: true,
      draftingIsTemplated: false,
    });
  });
});
