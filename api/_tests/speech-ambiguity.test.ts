/**
 * Phase 9 — speech ambiguity.
 *
 * .claude/rules/ai-pipeline.md lists "any monetary amount extracted from voice" among
 * the always-confirm cases: "speech-to-text confuses digits". Forty-two thousand five
 * hundred coming back as forty-two thousand is a plausible-looking wrong number, and
 * nothing downstream can catch it — the confirmation card is the only place it can be.
 *
 * These run offline, so the built-in rule parser does the extraction. That is the mode
 * the app actually ships in today, and it is the harder case: the gate must not depend
 * on a model reporting low confidence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { installFirebaseTestCredentials, useClient } from '../_testing/stubs';

installFirebaseTestCredentials();
silenceRequestLogs();

interface ChatBody {
  message: { content: string; intent: string | null };
  ui: { component: string; props: Record<string, unknown> } | null;
}

let world: TestWorld;
let uid: string;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
  uid = world.alice.firebaseUid;
});

async function chat(text: string, source: 'chat' | 'voice'): Promise<TestResponse> {
  return call(dispatch, { method: 'POST', path: 'chat', as: uid, body: { text, source } });
}

describe('a monetary amount from voice always confirms', () => {
  it('confirms a voice-dictated payment rather than recording it', async () => {
    const response = await chat('paid 42500 for the home loan', 'voice');

    expect(response.status).toBe(200);
    const body = dataOf<ChatBody>(response);
    expect(body.ui?.component).toBe('confirmation-prompt');
    // Nothing is written until the user says yes.
    expect(world.db.rows('financial_instances')).toHaveLength(0);
  });

  it('shows the parsed amount verbatim so a misheard digit is visible', async () => {
    const body = dataOf<ChatBody>(await chat('paid 42500 for the home loan', 'voice'));

    expect(JSON.stringify(body.ui?.props)).toContain('42500');
  });

  it('does not force a confirmation on a voice turn with no amount in it', async () => {
    const body = dataOf<ChatBody>(await chat('remind me to call the plumber tomorrow', 'voice'));

    expect(body.ui?.component).not.toBe('confirmation-prompt');
    expect(world.db.rows('commitments')).toHaveLength(1);
  });

  it('still confirms a typed recurring obligation — the risk gate is about the write, not the microphone', async () => {
    const body = dataOf<ChatBody>(await chat('home loan 42500 every month on the 5th', 'chat'));

    expect(body.ui?.component).toBe('confirmation-prompt');
    expect(world.db.rows('financial_obligations')).toHaveLength(0);
  });

  it('executes only what the user confirmed, without re-extracting the sentence', async () => {
    const proposal = dataOf<ChatBody>(await chat('home loan 42500 every month on the 5th', 'voice'));
    const props = proposal.ui!.props as { intent: string; args: Record<string, unknown> };

    // The user corrects the misheard amount on the card before confirming.
    const confirmed = await call(dispatch, {
      method: 'POST',
      path: 'chat',
      as: uid,
      body: { text: 'yes', confirm: { intent: props.intent, args: { ...props.args, amount: 42800 } } },
    });

    expect(confirmed.status).toBe(200);
    const obligations = world.db.rows('financial_obligations');
    expect(obligations).toHaveLength(1);
    expect(obligations[0]!.amount).toBe('42800');
  });

  it('refuses a confirmation whose arguments no longer validate', async () => {
    const proposal = dataOf<ChatBody>(await chat('home loan 42500 every month on the 5th', 'voice'));
    const props = proposal.ui!.props as { intent: string; args: Record<string, unknown> };

    const confirmed = await call(dispatch, {
      method: 'POST',
      path: 'chat',
      as: uid,
      body: {
        text: 'yes',
        confirm: { intent: props.intent, args: { ...props.args, amount: 'forty two thousand' } },
      },
    });

    expect(confirmed.status).toBe(422);
    expect(world.db.rows('financial_obligations')).toHaveLength(0);
  });

  it('cannot be talked out of confirming by claiming a chat source for a voice turn', async () => {
    // `source` only ever widens the gate, so a client that lies makes Symora more
    // cautious, never less. A recurring obligation confirms either way.
    const asChat = dataOf<ChatBody>(await chat('home loan 42500 every month on the 5th', 'chat'));
    const asVoice = dataOf<ChatBody>(await chat('home loan 42500 every month on the 5th', 'voice'));

    expect(asChat.ui?.component).toBe('confirmation-prompt');
    expect(asVoice.ui?.component).toBe('confirmation-prompt');
  });
});

describe('ambiguous relative dates are asked about, not guessed', () => {
  it('asks which direction "kal" meant instead of picking one', async () => {
    // Tenseless on purpose: "kal ... bharna hai" is clearly the future and "kal ... bhar
    // diya" clearly the past, so neither needs asking. A bare "kal" is the coin flip.
    const body = dataOf<ChatBody>(await chat('kal bijli ka bill', 'chat'));

    expect(body.message.content).toMatch(/yesterday or tomorrow/i);
    expect(body.ui).toBeNull();
    expect(world.db.rows('commitments')).toHaveLength(0);
  });
});
