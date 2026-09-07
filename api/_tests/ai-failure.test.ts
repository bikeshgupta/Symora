/**
 * Phase 9 — the AI provider's failure modes, through /api/chat.
 *
 * .claude/rules/ai-pipeline.md § Provider and model use: "Handle provider timeout,
 * malformed output, and quota exhaustion as expected states with clear user-facing
 * messages — never a silent failure and never a fabricated result."
 *
 * These run with a stub provider, so nothing here makes a network call. That is the
 * point: a timeout, an exhausted quota and a malformed tool call are exactly the states
 * you cannot provoke against a live key on demand, and they are the ones that decide
 * whether a bad afternoon at the provider costs the user their data or just their
 * phrasing.
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
  completion,
  installFirebaseTestCredentials,
  useAiProvider,
  useClient,
} from '../_testing/stubs';

installFirebaseTestCredentials();
silenceRequestLogs();

const ORIGINAL_ENV = { ...process.env };

/**
 * The failure modes only exist in AI mode; offline mode never calls a provider. These
 * two variables are what getAiMode() reads, and nothing here uses a real key.
 */
process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
process.env.AI_MODEL_CHEAP = 'test-cheap-model';
// Every case here is about what the *model* does, so every turn has to reach it. The
// default policy asks the model only for what the rule parser cannot read, which would
// quietly answer half of these before the provider stub was ever called
// (packages/core/src/ai/orchestrator/escalation.ts).
process.env.AI_CALL_POLICY = 'always';

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

let world: TestWorld;
let uid: string;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
  clearAiProvider();
  uid = world.alice.firebaseUid;
});

async function chat(text: string, extra: Record<string, unknown> = {}): Promise<TestResponse> {
  return call(dispatch, { method: 'POST', path: 'chat', as: uid, body: { text, ...extra } });
}

interface ChatBody {
  message: { content: string; intent: string | null };
  ui: { component: string; props: Record<string, unknown> } | null;
}

/** Errors shaped like the ones the SDK actually raises for each condition. */
const PROVIDER_FAILURES: { label: string; error: Error }[] = [
  {
    label: 'a request timeout',
    error: Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError', status: 408 }),
  },
  {
    label: 'a network failure',
    error: Object.assign(new Error('Connection error.'), {
      name: 'APIConnectionError',
      cause: new Error('fetch failed: ECONNREFUSED'),
    }),
  },
  {
    label: 'quota exhaustion',
    error: Object.assign(
      new Error('You exceeded your current quota, please check your plan and billing details.'),
      { name: 'RateLimitError', status: 429, code: 'insufficient_quota' },
    ),
  },
  {
    label: 'an invalid API key',
    error: Object.assign(new Error('Incorrect API key provided: sk-test***.'), {
      name: 'AuthenticationError',
      status: 401,
    }),
  },
  {
    label: 'a provider outage',
    error: Object.assign(new Error('The server had an error while processing your request.'), {
      name: 'InternalServerError',
      status: 500,
    }),
  },
];

describe('provider failure — the turn still answers', () => {
  for (const { label, error } of PROVIDER_FAILURES) {
    it(`answers 200 and falls back to the built-in parser on ${label}`, async () => {
      useAiProvider(async () => {
        throw error;
      });

      const response = await chat('remind me to call the electrician on Saturday');

      expect(response.status).toBe(200);
      const body = dataOf<ChatBody>(response);
      // The rule parser understood it, so the turn is not lost.
      expect(body.message.intent).toBe('create_reminder');
      expect(world.db.rows('commitments')).toHaveLength(1);
      expect(world.db.rows('commitments')[0]!.type).toBe('REMINDER');
    });

    it(`never leaks the provider's own error text to the user on ${label}`, async () => {
      useAiProvider(async () => {
        throw error;
      });

      const response = await chat('hmm');
      const serialized = JSON.stringify(response.body);

      expect(serialized).not.toContain('sk-test');
      expect(serialized).not.toContain('ECONNREFUSED');
      expect(serialized).not.toContain('billing details');
    });
  }

  it('says the model was unreachable rather than blaming the phrasing', async () => {
    useAiProvider(async () => {
      throw new Error('You exceeded your current quota.');
    });

    const body = dataOf<ChatBody>(await chat('mmm hmm'));

    // A clear user-facing message, not a silent failure and not a fabricated answer.
    expect(body.message.content).toMatch(/couldn't reach my language model/i);
    expect(body.message.intent).toBeNull();
  });

  it('meters the failed call honestly as zero tokens rather than skipping the row', async () => {
    useAiProvider(async () => {
      throw new Error('Request timed out.');
    });

    await chat('what is pending?');

    const usage = world.db.rows('ai_usage_events');
    expect(usage).toHaveLength(1);
    expect(usage[0]!.total_tokens).toBe(0);
    expect(usage[0]!.user_id).toBe(world.alice.record.id);
  });

  it('does not retry a provider that just failed', async () => {
    const complete = vi.fn(async () => {
      throw new Error('Request timed out.');
    });
    useAiProvider(complete);

    await chat('add a task to renew the policy');

    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe('malformed model output', () => {
  it('ignores a tool call naming a tool that is not in the registry', async () => {
    useAiProvider(async () =>
      completion({
        toolCalls: [{ id: 't1', name: 'delete_everything', arguments: { confirm: true } }],
      }),
    );

    const response = await chat('do something clever');

    expect(response.status).toBe(200);
    expect(dataOf<ChatBody>(response).message.intent).toBeNull();
    expect(world.db.rows('commitments')).toHaveLength(0);
  });

  it('rejects a registered tool called with arguments that fail its schema', async () => {
    // A required field simply absent — the commonest shape of malformed output.
    useAiProvider(async () =>
      completion({
        toolCalls: [{ id: 't1', name: 'create_task', arguments: { confidence: 0.95 } }],
      }),
    );

    const response = await chat('add that thing');

    // Never a 500: the user's sentence may have been perfectly clear.
    expect(response.status).toBe(200);
    expect(world.db.rows('commitments')).toHaveLength(0);
    expect(dataOf<ChatBody>(response).message.content).toBeTruthy();
  });

  it('does not coerce a wrongly-typed argument into something plausible', async () => {
    useAiProvider(async () =>
      completion({
        toolCalls: [
          {
            id: 't1',
            name: 'create_financial_obligation',
            arguments: {
              accountName: 'Home loan',
              obligationType: 'emi',
              amount: 'forty two thousand five hundred',
              currency: 'INR',
              dueDay: 5,
              recurrenceRule: 'monthly',
              confidence: 0.99,
            },
          },
        ],
      }),
    );

    const response = await chat('home loan 42500 monthly on the 5th');

    expect(response.status).toBe(200);
    // Nothing invented, nothing written.
    expect(world.db.rows('financial_obligations')).toHaveLength(0);
    expect(JSON.stringify(response.body)).not.toContain('42500');
  });

  it('ignores a user_id the model tried to supply', async () => {
    useAiProvider(async () =>
      completion({
        toolCalls: [
          {
            id: 't1',
            name: 'create_task',
            arguments: { title: 'Call the bank', user_id: world.bob.record.id, userId: world.bob.record.id, confidence: 0.95 },
          },
        ],
      }),
    );

    await chat('call the bank');

    const rows = world.db.rows('commitments');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(world.alice.record.id);
  });

  it('treats a tool call with no arguments at all as unusable rather than as defaults', async () => {
    useAiProvider(async () =>
      completion({ toolCalls: [{ id: 't1', name: 'create_reminder', arguments: null }] }),
    );

    const response = await chat('remind me');

    expect(response.status).toBe(200);
    expect(world.db.rows('commitments')).toHaveLength(0);
  });

  it('answers conversationally when the model returns plain text and no tool call', async () => {
    useAiProvider(async () => completion({ text: 'Which bill did you mean?' }));

    const body = dataOf<ChatBody>(await chat('pay it'));

    expect(body.message.content).toBe('Which bill did you mean?');
    expect(body.message.intent).toBeNull();
  });
});

describe('the model never produces the numbers that matter', () => {
  it('reports the total the domain service computed, not one the model asserted', async () => {
    await call(dispatch, {
      method: 'POST',
      path: 'finance/obligations',
      as: uid,
      body: { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
    });

    useAiProvider(async () =>
      completion({
        toolCalls: [
          {
            id: 't1',
            name: 'calculate_monthly_requirement',
            // A wrong total, asserted confidently. It must not reach the user.
            arguments: { total: 999999, currency: 'INR', confidence: 0.99 },
          },
        ],
      }),
    );

    const response = await chat('how much do I need this month?');
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('999999');
    expect(serialized).toContain('42500');
  });
});
