import { afterEach, describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';
import { openAiProvider, readTimeoutMs } from './openai-provider';

describe('readTimeoutMs', () => {
  it('falls back when the variable is unset', () => {
    expect(readTimeoutMs(undefined, 30_000)).toBe(30_000);
  });

  it('falls back when the variable is present but blank', () => {
    // The shape a half-filled .env actually takes. `??` misses this and Number('') is 0,
    // which the SDK reads as "abort immediately" rather than "not configured".
    expect(readTimeoutMs('', 30_000)).toBe(30_000);
  });

  it('falls back on anything non-numeric or non-positive', () => {
    expect(readTimeoutMs('soon', 30_000)).toBe(30_000);
    expect(readTimeoutMs('0', 30_000)).toBe(30_000);
    expect(readTimeoutMs('-5', 30_000)).toBe(30_000);
  });

  it('uses a real configured value', () => {
    expect(readTimeoutMs('5000', 30_000)).toBe(5_000);
  });
});

function unsupportedParamError(param: string): InstanceType<typeof OpenAI.APIError> {
  // The SDK hands its constructor the inner `error` object, not the whole envelope —
  // build it the same way or `.param` comes back undefined and the test proves nothing.
  return new OpenAI.APIError(
    400,
    { message: `Unsupported value: '${param}'`, param, type: 'invalid_request_error' },
    `Unsupported value: '${param}'`,
    undefined,
  );
}

function completion(): OpenAI.Chat.ChatCompletion {
  return {
    id: 'c1',
    model: 'test-model',
    object: 'chat.completion',
    created: 0,
    choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: 'ok', refusal: null } }],
  } as OpenAI.Chat.ChatCompletion;
}

/** Stubs the SDK's create() and returns every request body it was handed. */
function stubCreate(impl: (body: Record<string, unknown>) => OpenAI.Chat.ChatCompletion) {
  const bodies: Record<string, unknown>[] = [];
  vi.spyOn(OpenAI.Chat.Completions.prototype, 'create').mockImplementation((async (body: Record<string, unknown>) => {
    bodies.push(body);
    return impl(body);
  }) as never);
  return bodies;
}

describe('openAiProvider parameter compatibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AI_MODEL_CHEAP;
  });

  it('retries without temperature when the model refuses it', async () => {
    // Reasoning models take only the default temperature. The adapter learns that from
    // the 400 rather than from a hardcoded model list.
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'refuses-temperature';
    const bodies = stubCreate((body) => {
      if ('temperature' in body) throw unsupportedParamError('temperature');
      return completion();
    });

    const result = await openAiProvider.complete({ tier: 'cheap', temperature: 0.2, messages: [{ role: 'user', content: 'hi' }] });

    expect(result.text).toBe('ok');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty('temperature', 0.2);
    expect(bodies[1]).not.toHaveProperty('temperature');
  });

  it('sends max_completion_tokens after max_tokens is refused', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'refuses-max-tokens';
    const bodies = stubCreate((body) => {
      if ('max_tokens' in body) throw unsupportedParamError('max_tokens');
      return completion();
    });

    await openAiProvider.complete({ tier: 'cheap', maxOutputTokens: 256, messages: [{ role: 'user', content: 'hi' }] });

    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toHaveProperty('max_tokens', 256);
    expect(bodies[1]).toHaveProperty('max_completion_tokens', 256);
    expect(bodies[1]).not.toHaveProperty('max_tokens');
  });

  it('remembers the refusal so later calls do not pay the retry again', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'refuses-temperature-once';
    const bodies = stubCreate((body) => {
      if ('temperature' in body) throw unsupportedParamError('temperature');
      return completion();
    });

    const request = { tier: 'cheap' as const, temperature: 0.2, messages: [{ role: 'user' as const, content: 'hi' }] };
    await openAiProvider.complete(request);
    await openAiProvider.complete(request);

    // Two calls for the first request (learning), one for the second.
    expect(bodies).toHaveLength(3);
    expect(bodies[2]).not.toHaveProperty('temperature');
  });

  it('rethrows a 400 about anything it cannot adjust', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'refuses-tools';
    stubCreate(() => {
      throw unsupportedParamError('tools');
    });

    await expect(
      openAiProvider.complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(OpenAI.APIError);
  });
});
