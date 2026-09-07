/**
 * "Hello Symora" through /api/chat.
 *
 * The first thing most people type to an assistant is hello, and until this branch
 * existed the answer was "I'm not sure I understood that" — which was both wrong and the
 * worst possible first impression. These run the real route: routing, auth, the small
 * talk branch, the conversation repository and the fake row store.
 *
 * The provider stub throws on every call, so a greeting that reached extraction would
 * fail loudly here. That is deliberate: the point of answering a greeting before
 * extraction is that it costs nothing and behaves the same with no model, an unreachable
 * one, or a working one.
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

// AI mode, so that "no provider call was made" is a claim worth testing at all.
process.env.OPENAI_API_KEY = 'sk-test-not-a-real-key';
process.env.AI_MODEL_CHEAP = 'test-cheap-model';

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

let world: TestWorld;
let uid: string;
let providerCalls: number;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
  clearAiProvider();
  uid = world.alice.firebaseUid;
  providerCalls = 0;
  useAiProvider(async () => {
    providerCalls += 1;
    throw new Error('The model should not have been called for this turn.');
  });
});

async function chat(text: string): Promise<TestResponse> {
  return call(dispatch, { method: 'POST', path: 'chat', as: uid, body: { text } });
}

interface ChatBody {
  message: { content: string; intent: string | null };
  ui: { component: string; props: { suggestions?: { id: string; label: string; prompt: string }[] } } | null;
}

describe('greeting', () => {
  it('answers "Hello Symora" with an offer of help, not an apology', async () => {
    const response = await chat('Hello Symora');

    expect(response.status).toBe(200);
    const body = dataOf<ChatBody>(response);
    expect(body.message.content).toContain('how can I help you today?');
    expect(body.message.content).not.toContain("I'm not sure I understood");
    expect(providerCalls).toBe(0);
  });

  it('offers five things to try, as chips from the allowlisted component', async () => {
    const body = dataOf<ChatBody>(await chat('hi'));

    expect(body.ui?.component).toBe('suggestion-chips');
    expect(body.ui?.props.suggestions).toHaveLength(5);
    for (const suggestion of body.ui!.props.suggestions!) {
      expect(suggestion.label.length).toBeGreaterThan(0);
      expect(suggestion.prompt.length).toBeGreaterThan(0);
    }
  });

  it('records no intent and writes nothing but the two messages', async () => {
    await chat('namaste');

    const messages = world.db.rows('messages');
    expect(messages).toHaveLength(2);
    expect(messages[1]!.role).toBe('assistant');
    expect(messages[1]!.intent).toBeNull();
    expect(world.db.rows('commitments')).toHaveLength(0);
    expect(world.db.rows('memories')).toHaveLength(0);
    // No provider call means no usage row: reporting tokens nobody spent would be a lie.
    expect(world.db.rows('ai_usage_events')).toHaveLength(0);
  });

  it('replies in the language the user greeted in', async () => {
    const hindi = dataOf<ChatBody>(await chat('नमस्ते'));
    expect(hindi.message.content).toContain('नमस्ते');
  });

  it('falls back to the profile language for a greeting that has none of its own', async () => {
    // "hi" is not evidence of English; it is what everyone types.
    world.db.rows('users').find((row) => row.firebase_uid === uid)!.preferred_language = 'hinglish';

    const body = dataOf<ChatBody>(await chat('hi'));

    expect(body.message.content).toContain('bataiye');
  });

  it('answers "what can you do" the same way', async () => {
    const body = dataOf<ChatBody>(await chat('what can you do?'));
    expect(body.ui?.component).toBe('suggestion-chips');
    expect(providerCalls).toBe(0);
  });

  it('still treats a greeting with a request in it as the request', async () => {
    // The greeting branch matches whole messages only; anything else would silently drop
    // what the user actually asked for. Whether the reminder is then read by the rule
    // parser or by the model is a separate decision (escalation.ts) — what matters here
    // is that the turn went to extraction at all, and the commitment exists to prove it.
    const response = await chat('hi, remind me to call the electrician on Saturday');

    expect(response.status).toBe(200);
    expect(world.db.rows('commitments')).toHaveLength(1);
    expect(world.db.rows('commitments')[0]!.type).toBe('REMINDER');
  });
});
