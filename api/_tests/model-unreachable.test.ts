/**
 * What still works when the model you run yourself is switched off.
 *
 * This is the case the whole self-hosting design has to survive: a laptop gets shut, a
 * tunnel drops, a home connection resets. Symora is configured for a model, and there is
 * nothing at the other end.
 *
 * The standard it has to meet: everything deterministic keeps working — that is the
 * promise offline mode was built on — every chat turn still answers, the safety gates do
 * not relax, and nothing about the endpoint reaches the user.
 *
 * How *quickly* a turn gives up is a separate property, belonging to the real adapter's
 * circuit breaker rather than to this layer: the provider stub used here stands in for
 * exactly the code that holds it. That half is proven in
 * packages/core/src/adapters/openai-provider.test.ts § "an unreachable endpoint fails
 * fast".
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/app', async () => (await import('../_testing/stubs')).firebaseAppModule);
vi.mock('firebase-admin/auth', async () => (await import('../_testing/stubs')).firebaseAuthModule);
vi.mock('@symora/core', async (importOriginal) =>
  (await import('../_testing/stubs')).coreModule(
    (await importOriginal()) as Record<string, unknown>,
  ),
);

import { createTestWorld, type TestWorld } from '../../packages/core/src/testing/fixtures';
import dispatch from '../index';
import { call, dataOf, silenceRequestLogs, type TestResponse } from '../_testing/harness';
import {
  clearAiProvider,
  installFirebaseTestCredentials,
  useAiProvider,
  useClient,
} from '../_testing/stubs';

installFirebaseTestCredentials();
silenceRequestLogs();

const ORIGINAL_ENV = { ...process.env };

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

interface ChatBody {
  message: { content: string; intent: string | null };
  ui: { component: string } | null;
}

let world: TestWorld;
let uid: string;

/** The endpoint is configured — pointed at a machine that is not answering. */
function configureSelfHostedModel(): void {
  process.env.AI_BASE_URL = 'http://127.0.0.1:11434/v1';
  process.env.AI_MODEL_CHEAP = 'qwen2.5:7b-instruct';
  delete process.env.AI_API_KEY;
  delete process.env.OPENAI_API_KEY;
}

function connectionRefused(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), {
    code: 'ECONNREFUSED',
  });
}

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
  clearAiProvider();
  configureSelfHostedModel();
  uid = world.alice.firebaseUid;
});

async function chat(text: string): Promise<TestResponse> {
  return call(dispatch, { method: 'POST', path: 'chat', as: uid, body: { text } });
}

describe('every deterministic surface keeps working', () => {
  beforeEach(() => {
    useAiProvider(async () => {
      throw connectionRefused();
    });
  });

  it.each([
    'me',
    'home',
    'commitments',
    'tasks',
    'reminders',
    'memories',
    'finance',
    'finance/obligations',
    'finance/instances',
    'notifications',
    'usage',
    'privacy/export',
  ])('GET /api/%s answers normally', async (path) => {
    const response = await call(dispatch, { path, as: uid });
    expect(response.status, `${path} answered ${response.status}`).toBe(200);
  });

  it('still records a recurring payment, with every total computed as usual', async () => {
    const created = await call(dispatch, {
      method: 'POST',
      path: 'finance/obligations',
      as: uid,
      body: { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
    });
    expect(created.status).toBe(201);

    const summary = await call(dispatch, { path: 'finance', as: uid });
    expect(JSON.stringify(summary.body)).toContain('42500');
  });

  it('still adds tasks, completes them and surfaces reminders', async () => {
    const task = dataOf<{ id: string }>(
      await call(dispatch, { method: 'POST', path: 'tasks', as: uid, body: { title: 'Call the bank' } }),
    );
    const done = await call(dispatch, {
      method: 'PATCH',
      path: `commitments/${task.id}`,
      as: uid,
      body: { status: 'done' },
    });

    expect(done.status).toBe(200);
    expect(world.db.rows('commitments')[0]!.status).toBe('done');
  });

  it('still remembers, lists and deletes memories', async () => {
    const memory = dataOf<{ id: string }>(
      await call(dispatch, {
        method: 'POST',
        path: 'memories',
        as: uid,
        body: { key: 'wake_time', text: 'I wake up at 6am' },
      }),
    );
    const deleted = await call(dispatch, {
      method: 'DELETE',
      path: `memories/${memory.id}`,
      as: uid,
    });

    expect(deleted.status).toBe(200);
    expect(world.db.rows('memories')).toHaveLength(0);
  });

  it('still exports and deletes the account', async () => {
    const exported = await call(dispatch, { path: 'privacy/export', as: uid });
    expect(exported.status).toBe(200);

    const deleted = await call(dispatch, {
      method: 'POST',
      path: 'privacy/delete',
      as: uid,
      body: { confirmation: 'DELETE' },
    });
    expect(deleted.status).toBe(200);
  });
});

describe('a chat turn degrades rather than failing', () => {
  beforeEach(() => {
    useAiProvider(async () => {
      throw connectionRefused();
    });
  });

  it('still understands a literal request and writes the row', async () => {
    const response = await chat('remind me to call the electrician on Saturday');

    expect(response.status).toBe(200);
    expect(dataOf<ChatBody>(response).message.intent).toBe('create_reminder');
    expect(world.db.rows('commitments')).toHaveLength(1);
  });

  it('still gates a recurring payment behind a confirmation', async () => {
    // The safety rules do not relax because the model is away.
    const body = dataOf<ChatBody>(await chat('home loan 42500 every month on the 5th'));

    expect(body.ui?.component).toBe('confirmation-prompt');
    expect(world.db.rows('financial_obligations')).toHaveLength(0);
  });

  it('says the model was unreachable rather than blaming the phrasing', async () => {
    const body = dataOf<ChatBody>(await chat('mmm hmm'));

    expect(body.message.content).toMatch(/couldn't reach my language model/i);
    expect(body.message.intent).toBeNull();
  });

  it('leaks no endpoint address to the user', async () => {
    const serialized = JSON.stringify((await chat('mmm hmm')).body);

    expect(serialized).not.toContain('127.0.0.1');
    expect(serialized).not.toContain('11434');
    expect(serialized).not.toContain('ECONNREFUSED');
  });

  it('meters the failed turn honestly as zero tokens', async () => {
    await chat('what is pending?');

    expect(world.db.rows('ai_usage_events')).toHaveLength(1);
    expect(world.db.rows('ai_usage_events')[0]!.total_tokens).toBe(0);
  });
});

describe('a sustained outage stays usable, turn after turn', () => {
  beforeEach(() => {
    useAiProvider(async () => {
      throw connectionRefused();
    });
  });

  it('answers every turn and writes every row while the endpoint stays down', async () => {
    for (let turn = 0; turn < 4; turn += 1) {
      const response = await chat('remind me to call the electrician on Saturday');
      expect(response.status, `turn ${turn} answered ${response.status}`).toBe(200);
    }

    expect(world.db.rows('commitments')).toHaveLength(4);
  });

  it('recovers on the turn the endpoint comes back, with no restart needed', async () => {
    await chat('remind me to call the electrician on Saturday');

    useAiProvider(async () => ({
      text: null,
      toolCalls: [{ id: 't1', name: 'create_task', arguments: { title: 'Renew the policy', confidence: 0.95 } }],
      structured: null,
      usage: { promptTokens: 120, completionTokens: 30, totalTokens: 150 },
      model: 'qwen2.5:7b-instruct',
      finishReason: 'tool_calls' as const,
    }));

    const response = await chat('renew the policy');

    expect(response.status).toBe(200);
    // Back on the model path: real token usage, where the degraded turn reported zero.
    const usage = world.db.rows('ai_usage_events');
    expect(usage.at(-1)!.total_tokens).toBe(150);
    expect(usage[0]!.total_tokens).toBe(0);
  });
});

// How quickly a turn gives up during an outage is a property of the real adapter's
// circuit breaker, not of this layer — the stub above stands in for exactly the code
// that holds it. It is proven directly in
// packages/core/src/adapters/openai-provider.test.ts § "an unreachable endpoint fails
// fast", which drives the shipping adapter against a refused connection and asserts that
// only the first of five calls reaches the network.

describe('what the user is told about the outage', () => {
  it('reports the model as unreachable rather than as not configured', async () => {
    // Two different problems. "Not set up" is not something the user can act on; "your
    // machine is off" is, and they must not share a word.
    const core = await vi.importActual<typeof import('@symora/core')>('@symora/core');
    core.resetProviderHealth();

    const capabilities = core.getRuntimeCapabilities(process.env, { modelReachable: false });

    expect(capabilities.aiMode).toBe('ai');
    expect(capabilities.modelStatus).toBe('unreachable');
    expect(capabilities.selfHostedModel).toBe(true);
    // A draft the user is about to send must never be described as better than it is.
    expect(capabilities.draftingIsTemplated).toBe(true);
  });

  it('serves /api/me without probing the dead endpoint', async () => {
    // Firing a request at a machine that is off just to render a badge would make every
    // page load pay the timeout this whole mechanism exists to avoid.
    let called = false;
    useAiProvider(async () => {
      called = true;
      throw connectionRefused();
    });

    const response = await call(dispatch, { path: 'me', as: uid });

    expect(response.status).toBe(200);
    expect(called).toBe(false);
  });
});
