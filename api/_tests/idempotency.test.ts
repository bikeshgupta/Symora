/**
 * Phase 9 — duplicate writes, at the API boundary.
 *
 * .claude/rules/finance-rules.md § Idempotency: "Every write path assumes it may be
 * delivered twice — a retried request, a double tap, a re-sent voice command."
 *
 * The service-level test covers the rule; this covers the delivery, because the double
 * tap arrives as two HTTP requests, not two service calls, and a handler that read then
 * wrote would pass the first and fail here.
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
import { call, dataOf, silenceRequestLogs } from '../_testing/harness';
import { installFirebaseTestCredentials, useClient } from '../_testing/stubs';

installFirebaseTestCredentials();
silenceRequestLogs();

let world: TestWorld;
let uid: string;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
  uid = world.alice.firebaseUid;
});

async function createObligation(): Promise<string> {
  const response = await call(dispatch, {
    method: 'POST',
    path: 'finance/obligations',
    as: uid,
    body: { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
  });
  return dataOf<{ id: string }>(response).id;
}

async function currentInstanceId(): Promise<string> {
  const response = await call(dispatch, { path: 'finance/instances', as: uid });
  return dataOf<{ instance: { id: string } }[]>(response)[0]!.instance.id;
}

describe('duplicate writes — payments', () => {
  it('survives a double-tapped "mark paid" without a second row or an error', async () => {
    await createObligation();
    const instanceId = await currentInstanceId();
    const body = { instanceId, amount: 42500, paidDate: '2026-09-05' };

    const responses = await Promise.all([
      call(dispatch, { method: 'PATCH', path: 'finance/instances', as: uid, body }),
      call(dispatch, { method: 'PATCH', path: 'finance/instances', as: uid, body }),
      call(dispatch, { method: 'PATCH', path: 'finance/instances', as: uid, body }),
    ]);

    for (const response of responses) expect(response.status).toBe(200);
    const rows = world.db.rows('financial_instances').filter((row) => row.id === instanceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.paid_amount).toBe('42500');
    expect(rows[0]!.status).toBe('paid');
  });

  it('reports the same instance on a retry, not a fresh one', async () => {
    await createObligation();
    const instanceId = await currentInstanceId();
    const body = { instanceId, amount: 42500, paidDate: '2026-09-05' };

    const first = dataOf<{ id: string }>(
      await call(dispatch, { method: 'PATCH', path: 'finance/instances', as: uid, body }),
    );
    const retry = dataOf<{ id: string }>(
      await call(dispatch, { method: 'PATCH', path: 'finance/instances', as: uid, body }),
    );

    expect(retry.id).toBe(first.id);
  });

  it('never creates a duplicate period however often the instance list is read', async () => {
    await createObligation();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await call(dispatch, { path: 'finance/instances', as: uid });
      await call(dispatch, { path: 'finance', as: uid });
      await call(dispatch, { path: 'home', as: uid });
    }

    const keys = world.db.rows('financial_instances').map((row) => `${row.obligation_id}:${row.period}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('duplicate writes — memories', () => {
  it('leaves exactly one current row per key when the same fact is stated twice', async () => {
    const body = { key: 'wake_time', text: 'I wake up at 6am' };

    await call(dispatch, { method: 'POST', path: 'memories', as: uid, body });
    const second = await call(dispatch, { method: 'POST', path: 'memories', as: uid, body });

    // Restating an unchanged fact is not a new fact.
    expect(second.status).toBe(200);
    const current = world.db.rows('memories').filter((row) => row.effective_to === null);
    expect(current).toHaveLength(1);
  });

  it('supersedes rather than overwrites when the fact changes, keeping the old row', async () => {
    await call(dispatch, {
      method: 'POST',
      path: 'memories',
      as: uid,
      body: { key: 'wake_time', text: 'I wake up at 6am' },
    });
    await call(dispatch, {
      method: 'POST',
      path: 'memories',
      as: uid,
      body: { key: 'wake_time', text: 'I wake up at 7am' },
    });

    const rows = world.db.rows('memories').filter((row) => row.key === 'wake_time');
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.effective_to === null)).toHaveLength(1);
    expect(JSON.stringify(rows.find((row) => row.effective_to !== null)!.value_json)).toContain('6am');
  });
});

describe('duplicate writes — notifications', () => {
  it('generates one notification per occurrence however often the inbox is opened', async () => {
    await call(dispatch, {
      method: 'POST',
      path: 'reminders',
      as: uid,
      body: { title: 'Call the bank', dueDate: '2026-09-06' },
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await call(dispatch, { path: 'notifications', as: uid });
    }

    const keys = world.db.rows('notifications').map((row) => `${row.user_id}:${row.dedupe_key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not resurrect a dismissed notification on the next read', async () => {
    await call(dispatch, {
      method: 'POST',
      path: 'reminders',
      as: uid,
      body: { title: 'Call the bank', dueDate: '2026-09-06' },
    });
    await call(dispatch, { path: 'notifications', as: uid });

    const notification = world.db.rows('notifications')[0];
    if (!notification) return;

    await call(dispatch, {
      method: 'PATCH',
      path: `notifications/${notification.id}`,
      as: uid,
      body: { status: 'dismissed' },
    });
    await call(dispatch, { path: 'notifications', as: uid });

    expect(world.db.rows('notifications').find((row) => row.id === notification.id)!.status).toBe(
      'dismissed',
    );
  });
});

describe('duplicate writes — commitments', () => {
  it('marking a task done twice is a no-op success, not an error', async () => {
    const created = dataOf<{ id: string }>(
      await call(dispatch, { method: 'POST', path: 'tasks', as: uid, body: { title: 'Renew the policy' } }),
    );

    const first = await call(dispatch, {
      method: 'PATCH',
      path: `commitments/${created.id}`,
      as: uid,
      body: { status: 'done' },
    });
    const second = await call(dispatch, {
      method: 'PATCH',
      path: `commitments/${created.id}`,
      as: uid,
      body: { status: 'done' },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(world.db.rows('commitments').filter((row) => row.id === created.id)).toHaveLength(1);
    expect(world.db.rows('commitments')[0]!.status).toBe('done');
  });

  it('a retried create really does create two tasks — idempotency is for state changes, not for new facts', async () => {
    const body = { title: 'Buy groceries' };
    await call(dispatch, { method: 'POST', path: 'tasks', as: uid, body });
    await call(dispatch, { method: 'POST', path: 'tasks', as: uid, body });

    // Deliberate: two identical tasks are two intentions, and silently collapsing them
    // would lose one. Only writes with a natural key (a period, a dedupe key) dedupe.
    expect(world.db.rows('commitments')).toHaveLength(2);
  });
});
