import { describe, expect, it } from 'vitest';
import { getAiMode, getRuntimeCapabilities } from './runtime-mode';

const HOSTED = { AI_API_KEY: 'sk-test', AI_MODEL_CHEAP: 'gpt-test' };
const SELF_HOSTED = { AI_BASE_URL: 'http://localhost:11434/v1', AI_MODEL_CHEAP: 'qwen2.5:7b' };

describe('getAiMode', () => {
  it('is offline with no configuration at all', () => {
    expect(getAiMode({})).toBe('offline');
  });

  it('is offline with a key but no model configured', () => {
    // A key alone would fail on the first call; never leaving offline mode is better
    // than a deployment that looks configured and errors on every request.
    expect(getAiMode({ AI_API_KEY: 'sk-test' })).toBe('offline');
  });

  it('is offline with a model but nowhere to send it', () => {
    expect(getAiMode({ AI_MODEL_CHEAP: 'some-model' })).toBe('offline');
  });

  it('is ai for a hosted API with a key and a model', () => {
    expect(getAiMode(HOSTED)).toBe('ai');
  });

  it('still accepts OPENAI_API_KEY, so an existing deployment keeps working', () => {
    expect(getAiMode({ OPENAI_API_KEY: 'sk-test', AI_MODEL_CHEAP: 'gpt-test' })).toBe('ai');
  });

  it('is ai for a self-hosted endpoint with no key at all', () => {
    // A model on your own machine behind a private tunnel may legitimately have no
    // auth. Requiring a key there would mean inventing one to satisfy a check.
    expect(getAiMode(SELF_HOSTED)).toBe('ai');
  });

  it('is offline when a base URL is set but no model id is', () => {
    expect(getAiMode({ AI_BASE_URL: 'http://localhost:11434/v1' })).toBe('offline');
  });

  it('treats blank values as unset, which is what a half-filled .env looks like', () => {
    expect(getAiMode({ AI_API_KEY: '  ', AI_MODEL_CHEAP: 'm' })).toBe('offline');
    expect(getAiMode({ AI_BASE_URL: '', AI_MODEL_CHEAP: 'm' })).toBe('offline');
  });
});

describe('getRuntimeCapabilities', () => {
  it('reports offline with templated drafting and no server transcription', () => {
    expect(getRuntimeCapabilities({})).toEqual({
      aiMode: 'offline',
      modelStatus: 'offline',
      selfHostedModel: false,
      modelProvider: 'OpenAI',
      serverTranscription: false,
      draftingIsTemplated: true,
    });
  });

  it('reports full capability for a reachable hosted API', () => {
    expect(getRuntimeCapabilities(HOSTED)).toEqual({
      aiMode: 'ai',
      modelStatus: 'ready',
      selfHostedModel: false,
      modelProvider: 'OpenAI',
      serverTranscription: true,
      draftingIsTemplated: false,
    });
  });

  it('distinguishes an unreachable model from an unconfigured one', () => {
    // Two different problems: "not set up" and "your machine is off". A user can act on
    // the second and cannot act on the first, so they must not share a word.
    const unreachable = getRuntimeCapabilities(SELF_HOSTED, { modelReachable: false });

    expect(unreachable.aiMode).toBe('ai');
    expect(unreachable.modelStatus).toBe('unreachable');
    expect(getRuntimeCapabilities({}).modelStatus).toBe('offline');
  });

  it('says drafting is templated whenever the model cannot be reached', () => {
    // A draft the user is about to send should never be described as better than it is.
    expect(getRuntimeCapabilities(HOSTED, { modelReachable: false }).draftingIsTemplated).toBe(true);
    expect(getRuntimeCapabilities(HOSTED, { modelReachable: true }).draftingIsTemplated).toBe(false);
  });

  it('flags a self-hosted endpoint so the UI can explain an outage the user can fix', () => {
    expect(getRuntimeCapabilities(SELF_HOSTED).selfHostedModel).toBe(true);
    expect(getRuntimeCapabilities(HOSTED).selfHostedModel).toBe(false);
  });

  it('does not promise server transcription from a self-hosted chat endpoint', () => {
    // A chat model is not a speech model. Claiming otherwise hands the user a mic that
    // fails silently on the first press.
    expect(getRuntimeCapabilities(SELF_HOSTED).serverTranscription).toBe(false);
    expect(
      getRuntimeCapabilities({ ...SELF_HOSTED, AI_API_KEY: 'sk-test' }).serverTranscription,
    ).toBe(false);
  });
});

/**
 * A hosted provider reached through AI_BASE_URL — Gemini's OpenAI-compatible endpoint is
 * the case this exists for. Before this, any base URL meant "a machine you run", so the
 * app told a Gemini user their own model was asleep.
 */
describe('a hosted provider behind a base URL', () => {
  const GEMINI = {
    AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    AI_API_KEY: 'a-real-looking-key',
    AI_MODEL_CHEAP: 'gemini-2.5-flash',
  };

  it('is not described as self-hosted, and is named', () => {
    const capabilities = getRuntimeCapabilities(GEMINI);

    expect(capabilities.aiMode).toBe('ai');
    expect(capabilities.selfHostedModel).toBe(false);
    expect(capabilities.modelProvider).toBe('Gemini');
  });

  it('still leaves transcription to the browser, because a chat endpoint is not a speech one', () => {
    expect(getRuntimeCapabilities(GEMINI).serverTranscription).toBe(false);
  });

  it('calls an endpoint nobody recognises the user own', () => {
    const own = getRuntimeCapabilities({ ...GEMINI, AI_BASE_URL: 'http://127.0.0.1:11434/v1' });

    expect(own.selfHostedModel).toBe(true);
    expect(own.modelProvider).toBe('your own model');
  });

  it('separates a spent quota from an endpoint that is not there', () => {
    // On a free tier the first is the ordinary end of a busy day and clears by itself;
    // the second is something to go and fix. Different sentences, different actions.
    expect(getRuntimeCapabilities(GEMINI, { modelRateLimited: true }).modelStatus).toBe('rate_limited');
    expect(getRuntimeCapabilities(GEMINI, { modelReachable: false }).modelStatus).toBe('unreachable');
  });
});
