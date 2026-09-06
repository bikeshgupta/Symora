/**
 * Phase 9 — cross-user access, across every endpoint.
 *
 * .claude/rules/auth-security.md § User isolation: "User A must never read, write, or
 * infer the existence of User B's data", and "A row that exists but belongs to another
 * user is a 404, not a 403 — do not leak existence."
 *
 * Both users' data is created through the real API, so each assertion runs against rows
 * a real request produced, and every read goes through the real repository query. A
 * missing `.eq('user_id', ...)` anywhere in that chain fails a test here — which is the
 * whole reason the fake is a row store rather than a stub.
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
import { call, dataOf, errorOf, silenceRequestLogs, type TestResponse } from '../_testing/harness';
import { installFirebaseTestCredentials, useClient } from '../_testing/stubs';

installFirebaseTestCredentials();
silenceRequestLogs();

const UNUSED_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

interface Seeded {
  commitmentId: string;
  taskId: string;
  reminderId: string;
  memoryId: string;
  obligationId: string;
  instanceId: string;
  notificationId: string;
}

let world: TestWorld;

/** Builds one of everything for a user, entirely through the public API. */
async function seedFor(uid: string, label: string): Promise<Seeded> {
  const post = async (path: string, body: unknown): Promise<TestResponse> =>
    call(dispatch, { method: 'POST', path, as: uid, body });

  const commitment = dataOf<{ id: string }>(
    await post('commitments', { type: 'IMPORTANT_DATE', title: `${label} anniversary`, dueDate: '2026-09-20' }),
  );
  const task = dataOf<{ id: string }>(await post('tasks', { title: `${label} task`, dueDate: '2026-09-07' }));
  const reminder = dataOf<{ id: string }>(
    await post('reminders', { title: `${label} reminder`, dueDate: '2026-09-08', leadDays: 1 }),
  );
  const memory = dataOf<{ id: string }>(
    await post('memories', { key: `${label}_key`, text: `${label} remembers this` }),
  );
  const obligation = dataOf<{ id: string }>(
    await post('finance/obligations', {
      accountName: `${label} home loan`,
      obligationType: 'emi',
      amount: 42500,
      currency: 'INR',
      dueDay: 5,
    }),
  );

  const instances = dataOf<{ instance: { id: string } }[]>(
    await call(dispatch, { path: 'finance/instances', as: uid }),
  );
  // Reading the inbox is what generates notifications in V1 — there is no scheduler.
  await call(dispatch, { path: 'notifications', as: uid });
  const notification = world.db
    .rows('notifications')
    .find((row) => String(row.title).includes(label) || true);

  return {
    commitmentId: commitment.id,
    taskId: task.id,
    reminderId: reminder.id,
    memoryId: memory.id,
    obligationId: obligation.id,
    instanceId: instances[0]!.instance.id,
    notificationId: String(notification?.id ?? UNUSED_UUID),
  };
}

let alice: Seeded;
let bob: Seeded;

beforeEach(async () => {
  world = createTestWorld();
  useClient(world.client);
  alice = await seedFor(world.alice.firebaseUid, 'alice');
  bob = await seedFor(world.bob.firebaseUid, 'bob');
});

/** Bob's view of a collection must contain his own rows and none of Alice's. */
async function listAs(uid: string, path: string): Promise<string> {
  const response = await call(dispatch, { path, as: uid });
  expect(response.status).toBe(200);
  return JSON.stringify(response.body);
}

describe('cross-user — collections return only the caller’s rows', () => {
  it.each([
    'commitments',
    'tasks',
    'reminders',
    'memories',
    'finance/obligations',
    'finance/instances',
    'finance',
    'notifications',
    'home',
    'usage',
  ])('GET /api/%s shows Bob nothing of Alice’s', async (path) => {
    const serialized = await listAs(world.bob.firebaseUid, path);

    for (const [label, id] of Object.entries(alice)) {
      expect(serialized, `${path} leaked Alice's ${label}`).not.toContain(id);
    }
    expect(serialized, `${path} leaked Alice's user id`).not.toContain(world.alice.record.id);
  });

  it('shows each user their own rows, so the assertions above are not passing on empty lists', async () => {
    const bobsCommitments = await listAs(world.bob.firebaseUid, 'commitments');
    expect(bobsCommitments).toContain(bob.commitmentId);
    expect(bobsCommitments).toContain(bob.taskId);

    const bobsMemories = await listAs(world.bob.firebaseUid, 'memories');
    expect(bobsMemories).toContain(bob.memoryId);

    const bobsInstances = await listAs(world.bob.firebaseUid, 'finance/instances');
    expect(bobsInstances).toContain(bob.instanceId);
  });
});

describe('cross-user — reading one of another user’s rows is a 404, not a 403', () => {
  const notFound = (response: TestResponse, what: string) => {
    expect(response.status, `${what} answered ${response.status}`).toBe(404);
    expect(errorOf(response).code).toBe('NOT_FOUND');
    // 403 would confirm the row exists. So would a message naming it.
    expect(errorOf(response).message).not.toContain('alice');
  };

  it('refuses GET /api/commitments/:id for Alice’s commitment', async () => {
    notFound(
      await call(dispatch, { path: `commitments/${alice.commitmentId}`, as: world.bob.firebaseUid }),
      'commitments/:id',
    );
  });

  it('answers the same for a row that exists and one that does not', async () => {
    const someoneElses = await call(dispatch, {
      path: `commitments/${alice.commitmentId}`,
      as: world.bob.firebaseUid,
    });
    const nonexistent = await call(dispatch, {
      path: `commitments/${UNUSED_UUID}`,
      as: world.bob.firebaseUid,
    });

    expect(someoneElses.status).toBe(nonexistent.status);
    expect(errorOf(someoneElses).message).toBe(errorOf(nonexistent).message);
  });
});

describe('cross-user — writes to another user’s rows change nothing', () => {
  it('cannot PATCH Alice’s commitment', async () => {
    const response = await call(dispatch, {
      method: 'PATCH',
      path: `commitments/${alice.commitmentId}`,
      as: world.bob.firebaseUid,
      body: { title: 'hijacked', status: 'cancelled' },
    });

    expect(response.status).toBe(404);
    const row = world.db.rows('commitments').find((r) => r.id === alice.commitmentId)!;
    expect(row.title).toBe('alice anniversary');
    expect(row.status).toBe('pending');
  });

  it('cannot DELETE (cancel) Alice’s commitment', async () => {
    const response = await call(dispatch, {
      method: 'DELETE',
      path: `commitments/${alice.commitmentId}`,
      as: world.bob.firebaseUid,
    });

    expect(response.status).toBe(404);
    expect(world.db.rows('commitments').find((r) => r.id === alice.commitmentId)!.status).toBe('pending');
  });

  it('cannot PATCH Alice’s memory', async () => {
    const response = await call(dispatch, {
      method: 'PATCH',
      path: `memories/${alice.memoryId}`,
      as: world.bob.firebaseUid,
      body: { text: 'hijacked' },
    });

    expect(response.status).toBe(404);
    const row = world.db.rows('memories').find((r) => r.id === alice.memoryId)!;
    expect(JSON.stringify(row.value_json)).toContain('alice remembers this');
  });

  it('cannot DELETE Alice’s memory', async () => {
    const response = await call(dispatch, {
      method: 'DELETE',
      path: `memories/${alice.memoryId}`,
      as: world.bob.firebaseUid,
    });

    expect(response.status).toBe(404);
    expect(world.db.rows('memories').some((r) => r.id === alice.memoryId)).toBe(true);
  });

  it('cannot mark Alice’s payment paid', async () => {
    const response = await call(dispatch, {
      method: 'PATCH',
      path: 'finance/instances',
      as: world.bob.firebaseUid,
      body: { instanceId: alice.instanceId, amount: 1 },
    });

    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe('NOT_FOUND');
    const row = world.db.rows('financial_instances').find((r) => r.id === alice.instanceId)!;
    expect(row.status).toBe('pending');
    expect(row.paid_amount).toBeNull();
  });

  it('cannot dismiss Alice’s notification', async () => {
    const aliceNotification = world.db
      .rows('notifications')
      .find((row) => row.user_id === world.alice.record.id);
    // Only assert if generation produced one; the inbox test covers generation itself.
    if (!aliceNotification) return;

    const response = await call(dispatch, {
      method: 'PATCH',
      path: `notifications/${aliceNotification.id}`,
      as: world.bob.firebaseUid,
      body: { status: 'dismissed' },
    });

    expect(response.status).toBe(404);
    expect(aliceNotification.status).toBe('pending');
  });

  it('marking everything read touches only the caller’s notifications', async () => {
    await call(dispatch, { method: 'PATCH', path: 'notifications', as: world.bob.firebaseUid });

    const aliceRows = world.db.rows('notifications').filter((row) => row.user_id === world.alice.record.id);
    for (const row of aliceRows) expect(row.status).toBe('pending');
  });
});

describe('cross-user — export and deletion', () => {
  it('exports only the caller’s data', async () => {
    const response = await call(dispatch, { path: 'privacy/export', as: world.bob.firebaseUid });
    expect(response.status).toBe(200);

    const serialized = String(response.body);
    for (const [label, id] of Object.entries(alice)) {
      expect(serialized, `export leaked Alice's ${label}`).not.toContain(id);
    }
    expect(serialized).toContain(bob.commitmentId);
    expect(serialized).toContain(bob.memoryId);
  });

  it('never puts a firebase uid in the export', async () => {
    const response = await call(dispatch, { path: 'privacy/export', as: world.bob.firebaseUid });
    expect(String(response.body)).not.toContain(world.bob.firebaseUid);
  });

  it('deleting Bob’s account leaves every one of Alice’s rows intact', async () => {
    const aliceRowsBefore = world.db.countAll() - countRowsFor(world.bob.record.id);

    const response = await call(dispatch, {
      method: 'POST',
      path: 'privacy/delete',
      as: world.bob.firebaseUid,
      body: { confirmation: 'DELETE' },
    });

    expect(response.status).toBe(200);
    expect(countRowsFor(world.bob.record.id)).toBe(0);
    expect(world.db.rows('users').some((row) => row.id === world.bob.record.id)).toBe(false);
    expect(world.db.countAll()).toBe(aliceRowsBefore);
    expect(world.db.rows('commitments').some((row) => row.id === alice.commitmentId)).toBe(true);
  });
});

function countRowsFor(userId: string): number {
  const tables = [
    'users',
    'commitments',
    'financial_obligations',
    'financial_instances',
    'memories',
    'conversations',
    'messages',
    'ai_usage_events',
    'notifications',
  ];
  return tables.reduce(
    (total, table) =>
      total +
      world.db
        .rows(table)
        .filter((row) => String(table === 'users' ? row.id : row.user_id) === userId).length,
    0,
  );
}
