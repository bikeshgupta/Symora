import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OpenAI from 'openai';
import {
  getProviderHealth,
  openAiProvider,
  readTimeoutMs,
  resetAiClient,
  resetProviderHealth,
} from './openai-provider';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  resetProviderHealth();
  resetAiClient();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetProviderHealth();
  resetAiClient();
});

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

  it('rethrows a 400 it has already tried to adjust for', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'refuses-tools-always';
    stubCreate(() => {
      throw unsupportedParamError('tools');
    });

    await expect(
      openAiProvider.complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(OpenAI.APIError);
  });

  it('does not open the circuit for a rejected request', async () => {
    // A 400 fails identically forever. Backing off from it would hide a fixable
    // configuration fault behind a "temporarily unavailable" that never resolves.
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL_CHEAP = 'refuses-everything';
    stubCreate(() => {
      throw unsupportedParamError('response_format');
    });

    await openAiProvider
      .complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] })
      .catch(() => undefined);

    expect(getProviderHealth().state).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Pointing at a model you run yourself
// ---------------------------------------------------------------------------

function selfHosted(): void {
  process.env.AI_BASE_URL = 'http://127.0.0.1:11434/v1';
  process.env.AI_MODEL_CHEAP = 'qwen2.5:7b-instruct';
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
}

const TOOLS = [
  {
    name: 'create_task',
    description: 'Add a task the user has to do.',
    parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
  },
];

function jsonReply(content: string): OpenAI.Chat.ChatCompletion {
  return {
    id: 'c1',
    model: 'qwen2.5:7b-instruct',
    object: 'chat.completion',
    created: 0,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message: { role: 'assistant', content, refusal: null },
      },
    ],
  } as OpenAI.Chat.ChatCompletion;
}

describe('a self-hosted, OpenAI-compatible endpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('works with no API key at all', async () => {
    // A model behind a private tunnel may legitimately have no auth, and requiring a key
    // there would mean inventing one to satisfy a check.
    selfHosted();
    stubCreate(() => completion());

    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.text).toBe('ok');
  });

  it('still refuses to talk to the hosted API without a key', async () => {
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.AI_MODEL_CHEAP = 'gpt-test';

    await expect(
      openAiProvider.complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/AI_API_KEY|AI_BASE_URL/);
  });

  it('names the model tier that is missing rather than failing anonymously', async () => {
    selfHosted();
    delete process.env.AI_MODEL_CHEAP;

    await expect(
      openAiProvider.complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/AI_MODEL_CHEAP/);
  });
});

describe('JSON tool mode — for models without native tool calling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to JSON when the endpoint refuses the tools parameter', async () => {
    selfHosted();
    process.env.AI_MODEL_CHEAP = 'no-native-tools';
    const bodies = stubCreate((body) => {
      if ('tools' in body) throw unsupportedParamError('tools');
      return jsonReply(JSON.stringify({ tool: 'create_task', args: { title: 'Call the plumber' } }));
    });

    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'system', content: 'You are Symora.' }, { role: 'user', content: 'call the plumber' }],
      tools: TOOLS,
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toHaveProperty('tools');
    expect(bodies[1]).toHaveProperty('response_format', { type: 'json_object' });
    // Mapped back into the shape the pipeline already understands, so nothing above the
    // AIProvider boundary can tell which mode was used.
    expect(result.toolCalls).toEqual([
      { id: 'json-mode', name: 'create_task', arguments: { title: 'Call the plumber' } },
    ]);
    expect(result.finishReason).toBe('tool_calls');
  });

  it('describes the tools in the prompt, since the tools parameter is gone', async () => {
    selfHosted();
    process.env.AI_MODEL_CHEAP = 'json-only-model';
    process.env.AI_TOOL_MODE = 'json';
    const bodies = stubCreate(() => jsonReply(JSON.stringify({ tool: null, text: 'Which one?' })));

    await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'system', content: 'You are Symora.' }, { role: 'user', content: 'hi' }],
      tools: TOOLS,
    });

    const serialized = JSON.stringify(bodies[0]);
    expect(serialized).toContain('create_task');
    expect(serialized).toContain('Add a task the user has to do.');
  });

  it('reads a reply that wrapped its JSON in a code fence', async () => {
    // Strict JSON mode is not universally honoured. A model that answered correctly but
    // chattily has still done the work.
    selfHosted();
    process.env.AI_TOOL_MODE = 'json';
    process.env.AI_MODEL_CHEAP = 'chatty-model';
    stubCreate(() =>
      jsonReply('Sure!\n```json\n{"tool":"create_task","args":{"title":"Buy milk"}}\n```'),
    );

    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'user', content: 'buy milk' }],
      tools: TOOLS,
    });

    expect(result.toolCalls[0]?.name).toBe('create_task');
  });

  it('drops a tool name that is not in the registry', async () => {
    selfHosted();
    process.env.AI_TOOL_MODE = 'json';
    process.env.AI_MODEL_CHEAP = 'inventive-model';
    stubCreate(() => jsonReply(JSON.stringify({ tool: 'delete_everything', args: {} })));

    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'user', content: 'do something' }],
      tools: TOOLS,
    });

    // The orchestrator would reject it anyway, but a tool call that never existed should
    // not reach it.
    expect(result.toolCalls).toEqual([]);
  });

  it('returns plain text when the model chose no tool', async () => {
    selfHosted();
    process.env.AI_TOOL_MODE = 'json';
    process.env.AI_MODEL_CHEAP = 'conversational-model';
    stubCreate(() => jsonReply(JSON.stringify({ tool: null, text: 'Which bill did you mean?' })));

    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'user', content: 'pay it' }],
      tools: TOOLS,
    });

    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBe('Which bill did you mean?');
  });

  it('survives a reply that is not JSON at all', async () => {
    selfHosted();
    process.env.AI_TOOL_MODE = 'json';
    process.env.AI_MODEL_CHEAP = 'unhelpful-model';
    stubCreate(() => jsonReply('I am not going to answer in JSON.'));

    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'user', content: 'hi' }],
      tools: TOOLS,
    });

    // No fabricated tool call. The turn falls through to a conversational reply, which
    // is the honest outcome.
    expect(result.toolCalls).toEqual([]);
    expect(result.text).toBe('I am not going to answer in JSON.');
  });

  it('honours AI_TOOL_MODE=native by refusing to fall back', async () => {
    selfHosted();
    process.env.AI_TOOL_MODE = 'native';
    process.env.AI_MODEL_CHEAP = 'native-only-deployment';
    stubCreate((body) => {
      if ('tools' in body) throw unsupportedParamError('tools');
      return completion();
    });

    // An operator who ruled out JSON mode should not get it silently anyway.
    await expect(
      openAiProvider.complete({
        tier: 'cheap',
        messages: [{ role: 'user', content: 'hi' }],
        tools: TOOLS,
      }),
    ).rejects.toThrow(OpenAI.APIError);
  });
});

describe('an unreachable endpoint fails fast', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function refuseConnection(): void {
    vi.spyOn(OpenAI.Chat.Completions.prototype, 'create').mockImplementation((async () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
        code: 'ECONNREFUSED',
      });
    }) as never);
  }

  it('reports the endpoint as unreachable after it refuses a connection', async () => {
    selfHosted();
    process.env.AI_MODEL_CHEAP = 'laptop-is-off';
    refuseConnection();

    await openAiProvider
      .complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] })
      .catch(() => undefined);

    expect(getProviderHealth().state).toBe('unreachable');
    expect(getProviderHealth().retryAt).toBeInstanceOf(Date);
  });

  it('stops making requests while the circuit is open', async () => {
    // The whole point: with the machine off, only the first turn waits. Without this,
    // every message costs a full timeout before falling back.
    selfHosted();
    process.env.AI_MODEL_CHEAP = 'laptop-is-off-2';
    refuseConnection();

    const request = { tier: 'cheap' as const, messages: [{ role: 'user' as const, content: 'hi' }] };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await openAiProvider.complete(request).catch(() => undefined);
    }

    expect(OpenAI.Chat.Completions.prototype.create).toHaveBeenCalledTimes(1);
  });

  it('still throws, so the caller falls back to the rule-based parser', async () => {
    selfHosted();
    process.env.AI_MODEL_CHEAP = 'laptop-is-off-3';
    refuseConnection();

    const request = { tier: 'cheap' as const, messages: [{ role: 'user' as const, content: 'hi' }] };
    await expect(openAiProvider.complete(request)).rejects.toThrow();
    // The fast-failed call throws too — a different error, but a thrown one either way,
    // which is what extractIntentResilient needs to reach the offline parser.
    await expect(openAiProvider.complete(request)).rejects.toThrow(/not responding/);
  });

  it('recovers as soon as the endpoint answers again', async () => {
    selfHosted();
    process.env.AI_MODEL_CHEAP = 'laptop-came-back';
    process.env.AI_UNREACHABLE_COOLDOWN_MS = '1';
    refuseConnection();

    const request = { tier: 'cheap' as const, messages: [{ role: 'user' as const, content: 'hi' }] };
    await openAiProvider.complete(request).catch(() => undefined);
    expect(getProviderHealth().state).toBe('unreachable');

    // The cooldown is configured at construction, so reach the closed state the way a
    // successful probe would rather than waiting on wall-clock time.
    resetProviderHealth();
    vi.restoreAllMocks();
    stubCreate(() => completion());

    const result = await openAiProvider.complete(request);
    expect(result.text).toBe('ok');
    expect(getProviderHealth().state).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// Against a real server
// ---------------------------------------------------------------------------

/**
 * Everything above stubs the SDK, which means it never proves the one line the whole
 * self-hosting feature rests on: that `AI_BASE_URL` actually decides where the request
 * goes. Deleting `baseURL` from the client leaves every one of those tests green.
 *
 * So these run against a real HTTP server on a real port, with nothing mocked. It is an
 * Ollama stand-in: same protocol, same shape of reply, no model.
 */
describe('talking to a real OpenAI-compatible server', () => {
  let server: import('node:http').Server;
  let port: number;
  let received: { path: string; auth: string | undefined; body: Record<string, unknown> }[] = [];
  let reply: (body: Record<string, unknown>) => { status: number; json: unknown };

  beforeEach(async () => {
    const { createServer } = await import('node:http');
    received = [];
    reply = () => ({
      status: 200,
      json: {
        model: 'served-model',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'from the server' },
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
      },
    });

    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : {};
        received.push({ path: req.url ?? '', auth: req.headers.authorization, body });
        const answer = reply(body);
        res.writeHead(answer.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer.json));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;

    process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
    process.env.AI_MODEL_CHEAP = 'served-model';
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetAiClient();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('sends the request to AI_BASE_URL', async () => {
    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.path).toBe('/v1/chat/completions');
    expect(received[0]!.body).toMatchObject({ model: 'served-model' });
    expect(result.text).toBe('from the server');
    expect(result.usage.totalTokens).toBe(14);
  });

  it('sends AI_API_KEY as a bearer token, so a proxy in front of Ollama can require it', async () => {
    // Ollama has no auth of its own. This header is the whole mechanism for putting some
    // in front of it without changing any Symora code.
    process.env.AI_API_KEY = 'a-long-random-secret';
    resetAiClient();

    await openAiProvider.complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] });

    expect(received[0]!.auth).toBe('Bearer a-long-random-secret');
  });

  it('falls back to JSON mode against a server that rejects the tools parameter', async () => {
    // What an Ollama model without tool-calling support actually does.
    process.env.AI_MODEL_CHEAP = 'served-model-no-tools';
    reply = (body) =>
      'tools' in body
        ? {
            status: 400,
            json: { error: { message: 'this model does not support tools', type: 'invalid_request_error' } },
          }
        : {
            status: 200,
            json: {
              model: 'served-model-no-tools',
              choices: [
                {
                  index: 0,
                  finish_reason: 'stop',
                  message: {
                    role: 'assistant',
                    content: JSON.stringify({ tool: 'create_task', args: { title: 'Buy milk' } }),
                  },
                },
              ],
            },
          };

    const result = await openAiProvider.complete({
      tier: 'cheap',
      messages: [{ role: 'user', content: 'buy milk' }],
      tools: TOOLS,
    });

    expect(received).toHaveLength(2);
    expect(received[1]!.body).not.toHaveProperty('tools');
    expect(result.toolCalls).toEqual([
      { id: 'json-mode', name: 'create_task', arguments: { title: 'Buy milk' } },
    ]);
  });

  it('opens the circuit when nothing is listening on the port', async () => {
    // The laptop-is-off case, end to end: a real connection to a real closed port.
    await new Promise<void>((resolve) => server.close(() => resolve()));
    resetProviderHealth();
    resetAiClient();

    const request = { tier: 'cheap' as const, messages: [{ role: 'user' as const, content: 'hi' }] };
    await expect(openAiProvider.complete(request)).rejects.toThrow();

    expect(getProviderHealth().state).toBe('unreachable');
    // And the next turn does not wait for a second connection attempt.
    await expect(openAiProvider.complete(request)).rejects.toThrow(/not responding/);

    // Re-listen so afterEach's close() has something to close.
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
});

/**
 * The failure that took the deployed app down: a model that answers slowly, or not at
 * all, outliving the serverless function that is waiting for it. The request timeout was
 * meant to prevent exactly that and did not, because the SDK applies it per attempt and
 * retried twice by default — so a 12s timeout was really a 36s worst case, past the
 * function's 30s ceiling. The platform killed the invocation, which meant no fallback to
 * the rule parser, no recorded failure, no open circuit, and the next turn did it again.
 */
describe('one call, one attempt — the timeout has to mean what it says', () => {
  let server: import('node:http').Server;
  let attempts: number;
  let hang: boolean;
  let openSockets: import('node:net').Socket[] = [];

  beforeEach(async () => {
    const { createServer } = await import('node:http');
    attempts = 0;
    hang = true;
    openSockets = [];

    server = createServer((req, res) => {
      attempts += 1;
      req.resume();
      if (hang) return; // never answers, like a machine under load
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'upstream is having a bad day' } }));
    });
    server.on('connection', (socket) => openSockets.push(socket));

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
    process.env.AI_MODEL_CHEAP = 'slow-model';
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    resetAiClient();
  });

  afterEach(async () => {
    for (const socket of openSockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('gives up at the timeout it was given, once', async () => {
    const startedAt = Date.now();

    await expect(
      openAiProvider.complete({
        tier: 'cheap',
        messages: [{ role: 'user', content: 'hi' }],
        timeoutMs: 300,
      }),
    ).rejects.toThrow();

    const elapsed = Date.now() - startedAt;
    // One attempt's worth of waiting, not three. The generous ceiling is for a slow CI
    // box; the assertion that matters is that it is nowhere near 3 × 300ms.
    expect(elapsed).toBeLessThan(900);
    expect(attempts).toBe(1);
  });

  it('does not repeat a failed request behind the caller back', async () => {
    // The SDK retries 5xx by default. Here that would spend the turn's whole budget on a
    // server that has already said it cannot help; the pipeline has a better answer
    // waiting — the rule-based parser — and gets to it in one round trip instead.
    hang = false;

    await expect(
      openAiProvider.complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow();

    expect(attempts).toBe(1);
  });

  it('honours AI_MAX_RETRIES when an operator asks for retries back', async () => {
    hang = false;
    process.env.AI_MAX_RETRIES = '1';
    resetAiClient();

    await expect(
      openAiProvider.complete({ tier: 'cheap', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow();

    expect(attempts).toBe(2);
  });
});
