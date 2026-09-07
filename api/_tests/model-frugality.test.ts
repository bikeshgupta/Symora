/**
 * Spending a model request only when one is needed, through the real route.
 *
 * The endpoints most people can point Symora at are rationed — a free tier with a daily
 * cap, a laptop with one GPU. Sending every turn to the model means the sentence that
 * genuinely needed one gets refused at 4pm because "Paid the electricity bill today",
 * which the rule parser matches exactly, spent the quota at noon.
 *
 * So these assert the split: the everyday sentences cost nothing and still write the
 * right rows, and the messy ones still reach the model.
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

// A configured, working provider. The question these ask is not whether it works — it is
// whether it is used when it does not have to be.
process.env.AI_API_KEY = 'test-key-not-a-real-one';
process.env.AI_MODEL_CHEAP = 'test-cheap-model';

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

let world: TestWorld;
let uid: string;
let modelCalls: number;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
  clearAiProvider();
  delete process.env.AI_CALL_POLICY;
  uid = world.alice.firebaseUid;
  modelCalls = 0;
  useAiProvider(async () => {
    modelCalls += 1;
    return completion({ text: 'the model was asked' });
  });
});

async function chat(text: string, extra: Record<string, unknown> = {}): Promise<TestResponse> {
  return call(dispatch, { method: 'POST', path: 'chat', as: uid, body: { text, ...extra } });
}

interface ChatBody {
  message: { content: string; intent: string | null };
  ui: { component: string; props: Record<string, unknown> } | null;
}

describe('turns the rule parser can read', () => {
  it('creates a reminder without asking the model', async () => {
    const body = dataOf<ChatBody>(await chat('Remind me to call the doctor tomorrow'));

    expect(modelCalls).toBe(0);
    expect(body.message.intent).toBe('create_reminder');
    expect(world.db.rows('commitments')).toHaveLength(1);
  });

  it('proposes a recurring payment without asking the model, and still confirms it', async () => {
    // The confirmation gate is not a model behaviour — it is the pipeline's, and it
    // applies identically to a rule-read turn. A recurring obligation always confirms.
    const body = dataOf<ChatBody>(await chat('Home loan 42500 every month on the 5th'));

    expect(modelCalls).toBe(0);
    expect(body.ui?.component).toBe('confirmation-prompt');
    expect(world.db.rows('financial_obligations')).toHaveLength(0);
  });

  it('answers a read without asking the model', async () => {
    await chat('what is pending?');
    expect(modelCalls).toBe(0);
  });

  it('records the turn as zero tokens rather than skipping the usage row', async () => {
    // The usage screen should show turns that cost nothing as costing nothing; a missing
    // row would read as lost data, and the count of rows is how "am I close to the cap?"
    // gets answered.
    await chat('Remind me to call the doctor tomorrow');

    const usage = world.db.rows('ai_usage_events');
    expect(usage).toHaveLength(1);
    expect(usage[0]!.total_tokens).toBe(0);
  });

  it('spends nothing at all on a greeting', async () => {
    await chat('hello');
    expect(modelCalls).toBe(0);
    expect(world.db.rows('ai_usage_events')).toHaveLength(0);
  });
});

describe('turns it cannot', () => {
  it('asks the model for a sentence the parser did not recognise', async () => {
    await chat('sort out the thing with the flat before it gets awkward');
    expect(modelCalls).toBe(1);
  });

  it('asks the model when the parser matched only partially', async () => {
    // No amount, so the obligation cannot be built from the pattern alone.
    await chat('Home loan i pay 5th of every month');
    expect(modelCalls).toBe(1);
  });

  it('goes back to a model request per turn when the deployment asks for it', async () => {
    process.env.AI_CALL_POLICY = 'always';

    await chat('Remind me to call the doctor tomorrow');

    expect(modelCalls).toBe(1);
  });
});
