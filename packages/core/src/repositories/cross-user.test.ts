/**
 * Phase 9 — user isolation at the repository boundary.
 *
 * .claude/rules/auth-security.md: the service-role client bypasses RLS, so "every
 * user-owned query filters on the request-context user_id" is not a convention here — it
 * is the access boundary. This asserts it one function at a time.
 *
 * The API-level cross-user suite is not a substitute, and finding that out is why this
 * file exists: dropping the `user_id` filter from `getMemoryById` left every one of those
 * tests green, because the *second* query on the same path still filtered and turned the
 * result into a 404. Defence in depth working as intended, and a mutation escaping
 * unnoticed all the same. Tested here, each query stands on its own.
 *
 * Every row below belongs to Alice. Every call below is made as Bob.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as commitmentsRepository from './commitments-repository';
import * as conversationsRepository from './conversations-repository';
import * as financialRepository from './financial-repository';
import * as memoriesRepository from './memories-repository';
import * as notificationsRepository from './notifications-repository';
import * as aiUsageRepository from './ai-usage-repository';
import * as usersRepository from './users-repository';
import { createTestWorld, type TestWorld } from '../testing/fixtures';

let world: TestWorld;
let alice: string;
let bob: string;

/** Ids of the rows Alice owns, so a Bob-scoped call can be pointed straight at them. */
let owned: {
  commitmentId: string;
  memoryId: string;
  obligationId: string;
  instanceId: string;
  conversationId: string;
  notificationId: string;
};

beforeEach(async () => {
  world = createTestWorld();
  alice = world.alice.record.id;
  bob = world.bob.record.id;

  const commitment = await commitmentsRepository.createCommitment(world.client, {
    userId: alice,
    type: 'TASK',
    title: 'Alice task',
    dueDate: '2026-09-06',
    source: 'chat',
  });
  const memory = await memoriesRepository.createMemory(world.client, {
    userId: alice,
    memoryType: 'preference',
    key: 'wake_time',
    valueJson: { text: 'Alice wakes at 6am' },
    source: 'user_stated',
    effectiveFrom: '2026-09-01',
  });
  const obligation = await financialRepository.createObligation(world.client, {
    userId: alice,
    commitmentId: commitment.id,
    accountName: 'Alice home loan',
    obligationType: 'emi',
    amount: 42500,
    currency: 'INR',
    dueDay: 5,
    recurrenceRule: 'monthly',
  });
  const instance = await financialRepository.getOrCreateInstanceForPeriod(world.client, {
    userId: alice,
    obligationId: obligation.id,
    period: '2026-09',
    expectedAmount: 42500,
  });
  const conversation = await conversationsRepository.createConversation(world.client, alice);
  await conversationsRepository.createMessage(world.client, {
    userId: alice,
    conversationId: conversation.id,
    role: 'user',
    content: 'Alice said something',
  });
  await aiUsageRepository.recordAiUsage(world.client, {
    userId: alice,
    provider: 'openai',
    model: 'test-cheap-model',
    intent: 'create_task',
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
  });
  await notificationsRepository.upsertNotifications(world.client, [
    {
      userId: alice,
      commitmentId: commitment.id,
      instanceId: null,
      type: 'task',
      title: 'Alice task',
      body: 'due today',
      scheduledFor: '2026-09-06',
      dedupeKey: 'alice-1',
    },
  ]);

  owned = {
    commitmentId: commitment.id,
    memoryId: memory.id,
    obligationId: obligation.id,
    instanceId: instance.id,
    conversationId: conversation.id,
    notificationId: String(world.db.rows('notifications')[0]!.id),
  };
});

describe('single-row reads return null for another user’s row', () => {
  it('commitments', async () => {
    expect(await commitmentsRepository.getCommitmentById(world.client, bob, owned.commitmentId)).toBeNull();
  });

  it('memories', async () => {
    expect(await memoriesRepository.getMemoryById(world.client, bob, owned.memoryId)).toBeNull();
  });

  it('memories by key', async () => {
    expect(
      await memoriesRepository.findCurrentByKey(world.client, bob, 'preference', 'wake_time'),
    ).toBeNull();
  });

  it('obligations', async () => {
    expect(await financialRepository.getObligationById(world.client, bob, owned.obligationId)).toBeNull();
  });

  it('instances', async () => {
    expect(await financialRepository.getInstanceById(world.client, bob, owned.instanceId)).toBeNull();
  });

  it('instances by period', async () => {
    expect(
      await financialRepository.getInstanceForPeriod(world.client, bob, owned.obligationId, '2026-09'),
    ).toBeNull();
  });

  it('conversations', async () => {
    expect(
      await conversationsRepository.getConversationById(world.client, bob, owned.conversationId),
    ).toBeNull();
  });

  it('users — the one read keyed on an id rather than on ownership', async () => {
    // getUserById is only ever called with the request context's own id, so this is a
    // sanity check that it reads by primary key rather than leaking a lookup.
    const record = await usersRepository.getUserById(world.client, alice);
    expect(record?.id).toBe(alice);
  });
});

describe('list reads return nothing of another user’s', () => {
  it.each([
    ['commitments', () => commitmentsRepository.listCommitments(world.client, { userId: bob })],
    ['pending commitments', () => commitmentsRepository.listPendingCommitments(world.client, { userId: bob })],
    ['commitments by title', () => commitmentsRepository.findPendingByTitle(world.client, bob, 'Alice')],
    ['memories', () => memoriesRepository.listMemories(world.client, bob, { includeSuperseded: true })],
    ['obligations', () => financialRepository.listObligations(world.client, bob)],
    [
      'obligations by name',
      () => financialRepository.findObligationsByAccountName(world.client, bob, 'home loan'),
    ],
    [
      'instances for obligation',
      () => financialRepository.listInstancesForObligation(world.client, bob, owned.obligationId),
    ],
    ['instances for period', () => financialRepository.listInstancesForPeriod(world.client, bob, '2026-09')],
    ['instances by status', () => financialRepository.listInstancesByStatus(world.client, bob, ['pending'])],
    ['conversations', () => conversationsRepository.listConversations(world.client, bob)],
    ['messages', () => conversationsRepository.listAllMessages(world.client, bob)],
    ['notifications', () => notificationsRepository.listNotifications(world.client, bob, { includeDismissed: true })],
  ])('%s', async (_label, read) => {
    expect(await read()).toEqual([]);
  });

  it('usage totals count nothing of another user’s', async () => {
    const totals = await aiUsageRepository.getUsageSince(world.client, bob, '2026-01-01T00:00:00.000Z');
    expect(totals.requests).toBe(0);
    expect(totals.totalTokens).toBe(0);
  });

  it('the pending notification count is zero for the wrong user', async () => {
    expect(await notificationsRepository.countPending(world.client, bob)).toBe(0);
  });

  it('the same reads do return Alice’s rows, so none of the above passes on an empty table', async () => {
    expect(await commitmentsRepository.listCommitments(world.client, { userId: alice })).toHaveLength(1);
    expect(await memoriesRepository.listMemories(world.client, alice, { includeSuperseded: true })).toHaveLength(1);
    expect(await financialRepository.listObligations(world.client, alice)).toHaveLength(1);
    expect(await conversationsRepository.listConversations(world.client, alice)).toHaveLength(1);
    expect(await conversationsRepository.listAllMessages(world.client, alice)).toHaveLength(1);
    expect(
      await notificationsRepository.listNotifications(world.client, alice, { includeDismissed: true }),
    ).toHaveLength(1);
    expect((await aiUsageRepository.getUsageSince(world.client, alice, '2026-01-01T00:00:00.000Z')).requests).toBe(1);
    expect(await notificationsRepository.countPending(world.client, alice)).toBe(1);
  });
});

describe('writes aimed at another user’s row change nothing', () => {
  /** Every stored row, deep-copied, so a mutation anywhere is visible. */
  function snapshot(): string {
    return JSON.stringify(
      Object.fromEntries(
        ['commitments', 'memories', 'financial_obligations', 'financial_instances', 'notifications'].map(
          (table) => [table, world.db.rows(table)],
        ),
      ),
    );
  }

  it.each([
    ['update a commitment', () => commitmentsRepository.updateCommitment(world.client, bob, owned.commitmentId, { title: 'hijacked' })],
    ['cancel a commitment', () => commitmentsRepository.cancelCommitment(world.client, bob, owned.commitmentId)],
    ['mark a commitment done', () => commitmentsRepository.markCommitmentDone(world.client, bob, owned.commitmentId)],
    ['reschedule a commitment', () => commitmentsRepository.rescheduleCommitment(world.client, bob, owned.commitmentId, '2027-01-01')],
    ['update a memory', () => memoriesRepository.updateMemory(world.client, bob, owned.memoryId, { valueJson: { text: 'hijacked' } })],
    ['supersede a memory', () => memoriesRepository.supersedeMemory(world.client, bob, owned.memoryId, '2026-09-30')],
    ['update a notification', () => notificationsRepository.updateStatus(world.client, bob, owned.notificationId, 'dismissed')],
  ])('%s', async (_label, write) => {
    const before = snapshot();
    expect(await write()).toBeNull();
    expect(snapshot()).toBe(before);
  });

  it('deleting another user’s memory reports false and removes nothing', async () => {
    const before = snapshot();
    expect(await memoriesRepository.deleteMemory(world.client, bob, owned.memoryId)).toBe(false);
    expect(snapshot()).toBe(before);
  });

  it('marking all read touches nothing of another user’s', async () => {
    const before = snapshot();
    expect(await notificationsRepository.markAllRead(world.client, bob)).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('paying another user’s instance throws rather than writing', async () => {
    const before = snapshot();
    await expect(
      financialRepository.updateInstancePaidState(world.client, bob, owned.instanceId, {
        status: 'paid',
        paidAmount: 1,
        paidDate: '2026-09-05',
      }),
    ).rejects.toThrow();
    expect(snapshot()).toBe(before);
  });

  it('the same writes do work for Alice, so none of the above passes for the wrong reason', async () => {
    expect(
      await commitmentsRepository.updateCommitment(world.client, alice, owned.commitmentId, { title: 'renamed' }),
    ).not.toBeNull();
    expect(await memoriesRepository.deleteMemory(world.client, alice, owned.memoryId)).toBe(true);
    expect(await notificationsRepository.markAllRead(world.client, alice)).toBe(1);
  });
});

describe('getOrCreateInstanceForPeriod cannot be used to reach another user’s series', () => {
  it('creates a separate row rather than returning Alice’s', async () => {
    // Bob naming Alice's obligation id must not hand him her instance. He gets his own
    // row instead — inert, since he has no obligation behind it — and never hers.
    const instance = await financialRepository.getOrCreateInstanceForPeriod(world.client, {
      userId: bob,
      obligationId: owned.obligationId,
      period: '2026-10',
      expectedAmount: 1,
    });

    expect(instance.userId).toBe(bob);
    expect(instance.id).not.toBe(owned.instanceId);
    expect(world.db.rows('financial_instances').find((row) => row.id === owned.instanceId)!.status).toBe(
      'pending',
    );
  });
});
