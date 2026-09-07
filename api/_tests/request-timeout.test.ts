/**
 * What happens when something hangs.
 *
 * The deployed app failed here: every /api/chat turn came back as a platform error page
 * — not Symora's error contract, no request id, nothing in the response a user or a
 * developer could act on — while every deterministic endpoint kept working. A model that
 * did not answer outlived the serverless function, and a killed invocation takes every
 * fallback with it: no rule-parser reply, no recorded failure, no open circuit, so the
 * next turn did exactly the same thing.
 *
 * Two guards, tested here through the real route: the pipeline's own budget, which
 * should answer with the rule parser long before the ceiling, and the request deadline
 * in `withApiHandler`, which is the net under everything else.
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
import { call, silenceRequestLogs, type TestResponse } from '../_testing/harness';
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

process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
process.env.AI_MODEL_CHEAP = 'test-cheap-model';

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
  process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
  process.env.AI_MODEL_CHEAP = 'test-cheap-model';
  delete process.env.AI_TURN_BUDGET_MS;
  delete process.env.API_REQUEST_TIMEOUT_MS;
  delete process.env.AI_CALL_POLICY;
});

async function chat(text: string): Promise<TestResponse> {
  return call(dispatch, { method: 'POST', path: 'chat', as: uid, body: { text } });
}

interface ErrorBody {
  error: { code: string; message: string; requestId: string };
}

describe('a request that hangs', () => {
  it('answers with the error contract rather than being killed by the platform', async () => {
    // A provider that never resolves — a model under load, a machine mid-suspend.
    process.env.API_REQUEST_TIMEOUT_MS = '120';
    useAiProvider(() => new Promise(() => {}));

    // A sentence the rule parser cannot read, so the turn genuinely reaches the model.
    const response = await chat('sort out the thing with the flat before it gets awkward');

    expect(response.status).toBe(504);
    const body = response.body as ErrorBody;
    expect(body.error.code).toBe('REQUEST_TIMEOUT');
    // A request id is the whole point: it is what ties this reply to the log line that
    // says what hung.
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    // And nothing internal travels with it.
    expect(JSON.stringify(response.body)).not.toContain('sk-test');
  });

  it('does not answer twice when the handler finishes after the deadline', async () => {
    // The late completion used to reject into nothing — an unhandled rejection, which
    // takes down the instance that just sent an honest 504.
    process.env.API_REQUEST_TIMEOUT_MS = '60';
    let release: (() => void) | undefined;
    useAiProvider(
      () =>
        new Promise((resolve) => {
          release = () => resolve(completion({ text: 'late' }));
        }),
    );

    const response = await chat('hmm');
    expect(response.status).toBe(504);

    // The handler finishes late and tries to answer a request that is already answered.
    // In Node that write throws; it must not escape as an unhandled rejection, which
    // would take down the instance that just sent an honest 504.
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.off('unhandledRejection', onUnhandled);

    expect(unhandled).toEqual([]);
    // And the answer the caller already has is untouched.
    expect(response.status).toBe(504);
    expect((response.body as ErrorBody).error.code).toBe('REQUEST_TIMEOUT');
  });
});

describe('the turn budget', () => {
  it('answers from the rule parser rather than starting a call it cannot finish', async () => {
    // A turn with no time left must not begin a model request: the platform would kill
    // the function mid-flight, which costs the user their answer and — on a metered
    // endpoint — a request they never got the benefit of.
    process.env.AI_TURN_BUDGET_MS = '1';
    process.env.AI_CALL_POLICY = 'always';
    let calls = 0;
    useAiProvider(async () => {
      calls += 1;
      return completion({ text: 'never reached' });
    });

    const response = await chat('sort out the thing with the flat before it gets awkward');

    expect(response.status).toBe(200);
    expect(calls).toBe(0);
  });
});
