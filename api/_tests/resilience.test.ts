/**
 * Phase 9 — quota exhaustion and network failure.
 *
 * The AI-failure suite covers the provider being unreachable. These are the two other
 * things that go wrong in production and are never seen in development: the month's
 * allowance running out, and the database being unavailable.
 *
 * Both have the same standard to meet (.claude/rules/ai-pipeline.md § Provider and model
 * use, .claude/rules/auth-security.md § Errors and logging): an expected state with a
 * clear message, never a silent failure, never a fabricated result, and never a leaked
 * internal detail.
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
import { call, dataOf, errorOf, silenceRequestLogs, type TestResponse } from '../_testing/harness';
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

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

interface ChatBody {
  message: { content: string; intent: string | null };
  ui: { component: string } | null;
}

let world: TestWorld;
let uid: string;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
  clearAiProvider();
  uid = world.alice.firebaseUid;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_MODEL_CHEAP;
  delete process.env.AI_MONTHLY_REQUEST_ALLOWANCE;
});

async function chat(text: string): Promise<TestResponse> {
  return call(dispatch, { method: 'POST', path: 'chat', as: uid, body: { text } });
}

/**
 * Pretends the user has already made `count` provider calls this month.
 *
 * Dated to today rather than to the fake's epoch: the allowance period is the current
 * calendar month in the user's timezone, so a row stamped in January counts towards
 * nothing in September.
 */
function seedUsage(count: number): void {
  const thisMonth = new Date().toISOString();
  for (let i = 0; i < count; i += 1) {
    world.db.rows('ai_usage_events').push(
      world.db.applyDefaults('ai_usage_events', {
        created_at: thisMonth,
        user_id: world.alice.record.id,
        provider: 'openai',
        model: 'test-cheap-model',
        intent: 'create_task',
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
      }),
    );
  }
}

function enableAi(allowance?: number): void {
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
  process.env.AI_MODEL_CHEAP = 'test-cheap-model';
  if (allowance !== undefined) process.env.AI_MONTHLY_REQUEST_ALLOWANCE = String(allowance);
}

describe('quota exhaustion', () => {
  it('stops calling the provider once the allowance is spent', async () => {
    enableAi(3);
    seedUsage(3);
    const complete = vi.fn(async () => completion());
    useAiProvider(complete);

    await chat('remind me to call the electrician on Saturday');

    expect(complete).not.toHaveBeenCalled();
  });

  it('still answers the turn, using the built-in parser', async () => {
    enableAi(3);
    seedUsage(3);
    useAiProvider(async () => completion());

    const response = await chat('remind me to call the electrician on Saturday');

    expect(response.status).toBe(200);
    expect(dataOf<ChatBody>(response).message.intent).toBe('create_reminder');
    expect(world.db.rows('commitments')).toHaveLength(1);
  });

  it('says the allowance is spent rather than pretending the model was unreachable', async () => {
    enableAi(3);
    seedUsage(3);
    useAiProvider(async () => completion());

    const body = dataOf<ChatBody>(await chat('mmm hmm'));

    expect(body.message.content).toMatch(/allowance/i);
    expect(body.message.content).not.toMatch(/couldn't reach my language model/i);
  });

  it('keeps every deterministic feature working with the allowance spent', async () => {
    enableAi(1);
    seedUsage(5);

    const created = await call(dispatch, {
      method: 'POST',
      path: 'finance/obligations',
      as: uid,
      body: { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
    });
    const summary = await call(dispatch, { path: 'finance', as: uid });
    const home = await call(dispatch, { path: 'home', as: uid });

    expect(created.status).toBe(201);
    expect(summary.status).toBe(200);
    expect(home.status).toBe(200);
    expect(JSON.stringify(summary.body)).toContain('42500');
  });

  it('reports the allowance and the reset date on /api/usage', async () => {
    enableAi(3);
    seedUsage(3);

    const usage = dataOf<{ allowance: number; remaining: number; exhausted: boolean; resetsOn: string }>(
      await call(dispatch, { path: 'usage', as: uid }),
    );

    expect(usage).toMatchObject({ allowance: 3, remaining: 0, exhausted: true });
    expect(usage.resetsOn).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('calls the provider normally while the allowance still has room', async () => {
    enableAi(10);
    seedUsage(3);
    const complete = vi.fn(async () => completion({ text: 'Which bill did you mean?' }));
    useAiProvider(complete);

    const body = dataOf<ChatBody>(await chat('pay it'));

    expect(complete).toHaveBeenCalledTimes(1);
    expect(body.message.content).toBe('Which bill did you mean?');
  });

  it('treats an unset allowance as unlimited rather than as zero', async () => {
    enableAi();
    seedUsage(500);
    const complete = vi.fn(async () => completion({ text: 'Which bill did you mean?' }));
    useAiProvider(complete);

    await chat('pay it');

    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('does not read usage at all when no provider is configured', async () => {
    // Offline mode makes no provider calls, so there is no allowance to check and no
    // reason to pay for the query on every turn.
    seedUsage(500);
    const response = await chat('remind me to call the electrician on Saturday');

    expect(response.status).toBe(200);
    expect(dataOf<ChatBody>(response).message.intent).toBe('create_reminder');
  });
});

describe('network failure — the database is unreachable', () => {
  const breakTable = (table: string) =>
    world.db.failTable(table, 'connect ECONNREFUSED 10.0.0.5:5432 (db.abcdefgh.supabase.co)');

  it('answers with the one error contract rather than crashing', async () => {
    breakTable('commitments');

    const response = await call(dispatch, { path: 'tasks', as: uid });

    expect(response.status).toBe(500);
    expect(errorOf(response).code).toBe('INTERNAL_ERROR');
    expect(errorOf(response).requestId).toBeTruthy();
  });

  it('leaks no host, no port and no driver text to the client', async () => {
    breakTable('commitments');

    const response = await call(dispatch, { path: 'tasks', as: uid });
    const serialized = JSON.stringify(response.body);

    expect(serialized).not.toContain('ECONNREFUSED');
    expect(serialized).not.toContain('5432');
    expect(serialized).not.toContain('supabase.co');
  });

  it('creates no payment state when the obligation write fails partway', async () => {
    // Creating an obligation writes a commitment first, then the obligation, then the
    // period's instance. The Supabase JS client has no multi-statement transaction, so
    // a failure in the middle leaves the commitment behind — a known limitation recorded
    // in PROGRESS.md, not a surprise. What must not survive is payment state: an
    // instance with no obligation would be money owed to nothing.
    breakTable('financial_obligations');

    const response = await call(dispatch, {
      method: 'POST',
      path: 'finance/obligations',
      as: uid,
      body: { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
    });

    expect(response.status).toBe(500);
    expect(world.db.rows('financial_obligations')).toHaveLength(0);
    expect(world.db.rows('financial_instances')).toHaveLength(0);
    // The orphan the missing transaction leaves. Cancelled-or-cleaned is future work;
    // it carries no payment state, so it is inert rather than wrong.
    expect(world.db.rows('commitments')).toHaveLength(1);
  });

  it('fails the request rather than serving a partial answer', async () => {
    breakTable('financial_instances');

    const response = await call(dispatch, { path: 'home', as: uid });

    // A home screen that silently omits the payments section would read as "nothing
    // due", which is the one wrong answer that matters here.
    expect(response.status).toBe(500);
    expect(errorOf(response).code).toBe('INTERNAL_ERROR');
  });

  it('still refuses an unauthenticated request when the database is down', async () => {
    breakTable('users');

    const response = await call(dispatch, { path: 'me', authorization: 'Bearer forged' });

    expect(response.status).toBe(401);
    expect(errorOf(response).code).toBe('UNAUTHENTICATED');
  });
});
