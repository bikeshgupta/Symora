/**
 * Phase 9 — data export and deletion.
 *
 * .claude/rules/auth-security.md § Privacy commitments: "The user can view every memory,
 * delete any memory, export their data, and delete their account. Account deletion
 * removes user-owned rows across every table."
 *
 * "Every table" is the part worth a test: deletion works by cascade from `users`, so a
 * future table whose user_id forgets `on delete cascade` would leave personal data
 * behind and nothing would say so. The last test here walks the tables rather than
 * naming a few.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as privacyService from './privacy-service';
import * as commitmentsService from '../commitments/commitments-service';
import * as financeService from '../finance/finance-service';
import * as memoryService from '../memory/memory-service';
import * as notificationService from '../notifications/notification-service';
import * as conversationsRepository from '../../repositories/conversations-repository';
import * as aiUsageRepository from '../../repositories/ai-usage-repository';
import * as auditRepository from '../../repositories/audit-repository';
import { SCHEMA } from '../../testing/schema';
import { createTestWorld, type TestWorld } from '../../testing/fixtures';

const KOLKATA = 'Asia/Kolkata';
const NOW = new Date('2026-09-06T06:00:00Z');

let world: TestWorld;

/** One row in every user-owned table, so nothing is exercised on an empty table. */
async function fillEverything(userId: string, label: string): Promise<void> {
  await commitmentsService.create(world.client, userId, {
    type: 'TASK',
    title: `${label} task`,
    dueDate: '2026-09-06',
  });
  await financeService.createObligationWithWindow(
    world.client,
    userId,
    { accountName: `${label} home loan`, obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
    NOW,
    KOLKATA,
  );
  await memoryService.rememberPreference(
    world.client,
    userId,
    { memoryType: 'preference', key: `${label}_wake_time`, value: `${label} wakes at 6am` },
    NOW,
    KOLKATA,
  );
  const conversation = await conversationsRepository.createConversation(world.client, userId);
  await conversationsRepository.createMessage(world.client, {
    userId,
    conversationId: conversation.id,
    role: 'user',
    content: `${label} said something`,
  });
  await aiUsageRepository.recordAiUsage(world.client, {
    userId,
    provider: 'openai',
    model: 'test-cheap-model',
    intent: 'create_task',
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
  });
  await notificationService.generate(world.client, userId, NOW, KOLKATA);
  await auditRepository.recordAuditEvent(world.client, {
    userId,
    action: 'access_denied',
    detail: { code: 'NOT_FOUND', method: 'GET', path: `/api/memories/${label}` },
  });
}

beforeEach(async () => {
  world = createTestWorld({ timezone: KOLKATA });
  await fillEverything(world.alice.record.id, 'alice');
  await fillEverything(world.bob.record.id, 'bob');
});

describe('exportData', () => {
  it('includes every category of data the user owns', async () => {
    const data = await privacyService.exportData(world.client, world.alice.record, NOW);

    expect(data.memories.length).toBeGreaterThan(0);
    expect(data.commitments.length).toBeGreaterThan(0);
    expect(data.financialObligations.length).toBeGreaterThan(0);
    expect(data.financialInstances.length).toBeGreaterThan(0);
    expect(data.conversations.length).toBeGreaterThan(0);
    expect(data.messages.length).toBeGreaterThan(0);
    expect(data.notifications.length).toBeGreaterThan(0);
  });

  it('carries none of another user’s rows', async () => {
    const data = await privacyService.exportData(world.client, world.alice.record, NOW);
    const serialized = JSON.stringify(data);

    expect(serialized).not.toContain(world.bob.record.id);
    expect(serialized).not.toContain('bob home loan');
    expect(serialized).not.toContain('bob wakes at 6am');
  });

  it('omits firebase_uid — an internal join key, not information about the user', async () => {
    const data = await privacyService.exportData(world.client, world.alice.record, NOW);

    expect(JSON.stringify(data)).not.toContain(world.alice.firebaseUid);
    expect(Object.keys(data.profile)).not.toContain('firebaseUid');
  });

  it('states plainly what Symora holds and how it learned it', async () => {
    const data = await privacyService.exportData(world.client, world.alice.record, NOW);

    expect(data.notice).toMatch(/intentionally/i);
    expect(data.notice).toMatch(/does not read your SMS/i);
    expect(data.exportedAt).toBe(NOW.toISOString());
  });

  it('includes superseded memories, so history is not quietly withheld', async () => {
    await memoryService.rememberPreference(
      world.client,
      world.alice.record.id,
      { memoryType: 'preference', key: 'alice_wake_time', value: 'alice wakes at 7am' },
      new Date('2026-09-07T06:00:00Z'),
      KOLKATA,
    );

    const data = await privacyService.exportData(world.client, world.alice.record, NOW);
    const serialized = JSON.stringify(data.memories);

    expect(serialized).toContain('6am');
    expect(serialized).toContain('7am');
  });

  it('serializes — the export is downloaded as JSON, so nothing in it may be unserializable', async () => {
    const data = await privacyService.exportData(world.client, world.alice.record, NOW);
    expect(() => JSON.stringify(data)).not.toThrow();
  });
});

describe('deleteAccount', () => {
  it('removes the user row and everything hanging off it', async () => {
    await privacyService.deleteAccount(world.client, world.alice.record.id, NOW);

    for (const table of Object.keys(SCHEMA)) {
      const remaining = world.db
        .rows(table)
        .filter((row) => String(table === 'users' ? row.id : row.user_id) === world.alice.record.id);
      expect(remaining, `${table} still holds Alice's rows`).toHaveLength(0);
    }
  });

  it('leaves the other user completely intact', async () => {
    const bobsRows = Object.keys(SCHEMA).map((table) => [
      table,
      world.db
        .rows(table)
        .filter((row) => String(table === 'users' ? row.id : row.user_id) === world.bob.record.id).length,
    ]);

    await privacyService.deleteAccount(world.client, world.alice.record.id, NOW);

    for (const [table, before] of bobsRows) {
      const after = world.db
        .rows(String(table))
        .filter((row) => String(table === 'users' ? row.id : row.user_id) === world.bob.record.id).length;
      expect(after, `${table} lost Bob's rows`).toBe(before);
    }
  });

  it('had rows in every table to delete, so the assertion above is not vacuous', () => {
    for (const table of Object.keys(SCHEMA)) {
      const rows = world.db
        .rows(table)
        .filter((row) => String(table === 'users' ? row.id : row.user_id) === world.alice.record.id);
      expect(rows.length, `no fixture rows in ${table}`).toBeGreaterThan(0);
    }
  });

  it('is idempotent — deleting an already-deleted account is not an error', async () => {
    await privacyService.deleteAccount(world.client, world.alice.record.id, NOW);
    await expect(
      privacyService.deleteAccount(world.client, world.alice.record.id, NOW),
    ).resolves.toMatchObject({ deletedUserId: world.alice.record.id });
  });

  it('reports what it deleted and when', async () => {
    const result = await privacyService.deleteAccount(world.client, world.alice.record.id, NOW);

    expect(result).toEqual({ deletedUserId: world.alice.record.id, deletedAt: NOW.toISOString() });
  });
});
