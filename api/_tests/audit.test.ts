/**
 * Phase 9 — the audit trail.
 *
 * .claude/rules/auth-security.md § Errors and logging: "An authorization failure logs an
 * `audit_events` row", and § Row Level Security: "audit_events is append-only: policies
 * grant insert and select, never update or delete". Neither was testable before Phase 9,
 * because no migration had created the table.
 *
 * The other half of an audit trail is what it must *not* hold. It sits outside the
 * request log's redaction, so a row that quietly accumulated memory or message content
 * would be a second copy of everything Symora knows, and the tests below hold it to
 * naming rows rather than quoting them.
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

const UNUSED_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld();
  useClient(world.client);
});

function auditRows(userId: string) {
  return world.db.rows('audit_events').filter((row) => row.user_id === userId);
}

describe('audit — authorization failures', () => {
  it('records a row when a caller reaches for a row that is not theirs', async () => {
    const alicesTask = dataOf<{ id: string }>(
      await call(dispatch, {
        method: 'POST',
        path: 'tasks',
        as: world.alice.firebaseUid,
        body: { title: 'Alice’s task' },
      }),
    );

    await call(dispatch, { path: `commitments/${alicesTask.id}`, as: world.bob.firebaseUid });

    const rows = auditRows(world.bob.record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('access_denied');
    expect(rows[0]!.target_id).toBe(alicesTask.id);
    // Attributed to whoever asked, never to whoever owns the row.
    expect(auditRows(world.alice.record.id)).toHaveLength(0);
  });

  it('attributes the row to the caller and carries the request id', async () => {
    const response = await call(dispatch, {
      path: `memories/${UNUSED_UUID}`,
      method: 'DELETE',
      as: world.alice.firebaseUid,
    });

    const rows = auditRows(world.alice.record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.request_id).toBe((response.body as { error: { requestId: string } }).error.requestId);
  });

  it('records the path but never the request body', async () => {
    await call(dispatch, {
      method: 'PATCH',
      path: `memories/${UNUSED_UUID}`,
      as: world.alice.firebaseUid,
      body: { text: 'my bank password is hunter2' },
    });

    const serialized = JSON.stringify(auditRows(world.alice.record.id));
    expect(serialized).toContain('/api/memories/');
    expect(serialized).not.toContain('hunter2');
  });

  it('writes nothing for an unauthenticated request — there is nobody to attribute it to', async () => {
    await call(dispatch, { path: `commitments/${UNUSED_UUID}`, authorization: 'Bearer forged' });

    expect(world.db.rows('audit_events')).toHaveLength(0);
  });

  it('writes nothing on a successful request', async () => {
    await call(dispatch, { path: 'me', as: world.alice.firebaseUid });
    await call(dispatch, { path: 'home', as: world.alice.firebaseUid });
    await call(dispatch, {
      method: 'POST',
      path: 'tasks',
      as: world.alice.firebaseUid,
      body: { title: 'Buy milk' },
    });

    expect(world.db.rows('audit_events')).toHaveLength(0);
  });

  it('still answers 404 when the audit write itself fails', async () => {
    // Best-effort by design: losing the audit row is bad, but turning a clean 404 into a
    // 500 tells the caller more about the failure than the 404 was willing to.
    const rows = world.db.rows('audit_events');
    Object.defineProperty(rows, 'push', {
      value: () => {
        throw new Error('audit table unavailable');
      },
    });

    const response = await call(dispatch, {
      path: `commitments/${UNUSED_UUID}`,
      as: world.alice.firebaseUid,
    });

    expect(response.status).toBe(404);
  });
});

describe('audit — payment corrections', () => {
  async function markPaid(amount: number, instanceId: string) {
    return call(dispatch, {
      method: 'PATCH',
      path: 'finance/instances',
      as: world.alice.firebaseUid,
      body: { instanceId, amount, paidDate: '2026-09-05' },
    });
  }

  let instanceId: string;

  beforeEach(async () => {
    await call(dispatch, {
      method: 'POST',
      path: 'finance/obligations',
      as: world.alice.firebaseUid,
      body: { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
    });
    instanceId = dataOf<{ instance: { id: string } }[]>(
      await call(dispatch, { path: 'finance/instances', as: world.alice.firebaseUid }),
    )[0]!.instance.id;
  });

  it('records nothing on a first payment — that is not a correction', async () => {
    await markPaid(42500, instanceId);
    expect(auditRows(world.alice.record.id)).toHaveLength(0);
  });

  it('records nothing on an identical re-mark — that is a duplicate, not a correction', async () => {
    await markPaid(42500, instanceId);
    await markPaid(42500, instanceId);
    expect(auditRows(world.alice.record.id)).toHaveLength(0);
  });

  it('records the amount that was overwritten when the user corrects it', async () => {
    await markPaid(42500, instanceId);
    await markPaid(40000, instanceId);

    const rows = auditRows(world.alice.record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('payment_corrected');
    expect(rows[0]!.target_table).toBe('financial_instances');
    expect(rows[0]!.target_id).toBe(instanceId);
    expect(rows[0]!.detail).toMatchObject({
      previousPaidAmount: '42500',
      paidAmount: '40000',
      previousStatus: 'paid',
      status: 'partial',
    });
  });

  it('records each correction, so a sequence of them is reconstructable', async () => {
    await markPaid(42500, instanceId);
    await markPaid(40000, instanceId);
    await markPaid(42500, instanceId);

    const rows = auditRows(world.alice.record.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => (row.detail as { paidAmount: string }).paidAmount)).toEqual([
      '40000',
      '42500',
    ]);
  });
});

describe('audit — memory deletion', () => {
  it('records that a memory was deleted, without recording what it said', async () => {
    const memory = dataOf<{ id: string }>(
      await call(dispatch, {
        method: 'POST',
        path: 'memories',
        as: world.alice.firebaseUid,
        body: { key: 'bank_branch', text: 'my account is at the Andheri East branch' },
      }),
    );

    await call(dispatch, {
      method: 'DELETE',
      path: `memories/${memory.id}`,
      as: world.alice.firebaseUid,
    });

    const rows = auditRows(world.alice.record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe('memory_deleted');
    expect(rows[0]!.target_id).toBe(memory.id);
    expect(JSON.stringify(rows)).not.toContain('Andheri');
  });

  it('records nothing when the delete found nothing of the caller’s to delete', async () => {
    const alicesMemory = dataOf<{ id: string }>(
      await call(dispatch, {
        method: 'POST',
        path: 'memories',
        as: world.alice.firebaseUid,
        body: { key: 'wake_time', text: 'I wake up at 6am' },
      }),
    );

    await call(dispatch, {
      method: 'DELETE',
      path: `memories/${alicesMemory.id}`,
      as: world.bob.firebaseUid,
    });

    // Bob gets an access_denied for the attempt, and no memory_deleted anywhere.
    expect(auditRows(world.bob.record.id).map((row) => row.action)).toEqual(['access_denied']);
    expect(auditRows(world.alice.record.id)).toHaveLength(0);
    expect(world.db.rows('memories')).toHaveLength(1);
  });
});

describe('audit — append-only', () => {
  it('is deleted with its user, so an account deletion leaves no trail behind', async () => {
    await call(dispatch, { path: `commitments/${UNUSED_UUID}`, as: world.alice.firebaseUid });
    expect(auditRows(world.alice.record.id).length).toBeGreaterThan(0);

    await call(dispatch, {
      method: 'POST',
      path: 'privacy/delete',
      as: world.alice.firebaseUid,
      body: { confirmation: 'DELETE' },
    });

    expect(world.db.rows('audit_events')).toHaveLength(0);
  });
});
