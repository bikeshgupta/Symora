/**
 * Phase 9 — notifications, against real rows.
 *
 * The planner's own tests cover which notifications *should* exist. These cover what
 * happens when they are written: that generation on every inbox read does not multiply
 * rows, that a dismissal survives the next read, that lead times fire early rather than
 * instead, and that the dedupe key is computed in the user's timezone rather than the
 * server's — which decides whether a reminder arrives on the right day at all.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as notificationService from './notification-service';
import * as commitmentsService from '../commitments/commitments-service';
import * as financeService from '../finance/finance-service';
import * as notificationsRepository from '../../repositories/notifications-repository';
import { createTestWorld, type TestWorld } from '../../testing/fixtures';

const KOLKATA = 'Asia/Kolkata';

let world: TestWorld;
let userId: string;

beforeEach(() => {
  world = createTestWorld({ timezone: KOLKATA });
  userId = world.alice.record.id;
});

describe('notification generation', () => {
  it('creates one row per source per day however often the inbox is read', async () => {
    const now = new Date('2026-09-06T06:00:00Z');
    await commitmentsService.create(world.client, userId, {
      type: 'TASK',
      title: 'Renew the policy',
      dueDate: '2026-09-06',
    });

    const first = await notificationService.getInbox(world.client, userId, now, KOLKATA);
    const second = await notificationService.getInbox(world.client, userId, now, KOLKATA);
    const third = await notificationService.getInbox(world.client, userId, now, KOLKATA);

    expect(first.generated).toBe(1);
    expect(second.generated).toBe(0);
    expect(third.generated).toBe(0);
    expect(world.db.rows('notifications')).toHaveLength(1);
  });

  it('does not resurrect a dismissed notification on the next read', async () => {
    const now = new Date('2026-09-06T06:00:00Z');
    await commitmentsService.create(world.client, userId, {
      type: 'TASK',
      title: 'Renew the policy',
      dueDate: '2026-09-06',
    });

    const inbox = await notificationService.getInbox(world.client, userId, now, KOLKATA);
    await notificationService.setStatus(world.client, userId, inbox.notifications[0]!.id, 'dismissed');
    const after = await notificationService.getInbox(world.client, userId, now, KOLKATA);

    expect(after.generated).toBe(0);
    expect(world.db.rows('notifications')[0]!.status).toBe('dismissed');
    // Dismissed rows stay out of the inbox but are not deleted.
    expect(after.notifications).toHaveLength(0);
  });

  it('fires a lead-time reminder early and again on the day, as two occurrences', async () => {
    await commitmentsService.create(world.client, userId, {
      type: 'REMINDER',
      title: 'Insurance premium',
      dueDate: '2026-09-08',
      leadDays: 2,
    });

    const onTheLeadDate = new Date('2026-09-06T06:00:00Z');
    const onTheDueDate = new Date('2026-09-08T06:00:00Z');

    expect(await notificationService.generate(world.client, userId, onTheLeadDate, KOLKATA)).toBe(1);
    expect(await notificationService.generate(world.client, userId, onTheDueDate, KOLKATA)).toBe(1);

    const rows = world.db.rows('notifications');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.scheduled_for).sort()).toEqual(['2026-09-06', '2026-09-08']);
    // The early one says it is coming, the later one says it is due.
    expect(String(rows.find((row) => row.scheduled_for === '2026-09-06')!.body)).toContain('Coming up');
  });

  it('keeps notifying while something stays overdue, once a day', async () => {
    await commitmentsService.create(world.client, userId, {
      type: 'TASK',
      title: 'Submit the form',
      dueDate: '2026-09-01',
    });

    for (const day of ['2026-09-02', '2026-09-03', '2026-09-04']) {
      await notificationService.generate(world.client, userId, new Date(`${day}T06:00:00Z`), KOLKATA);
      // Twice on the same day, to prove the second is a no-op.
      await notificationService.generate(world.client, userId, new Date(`${day}T18:00:00Z`), KOLKATA);
    }

    expect(world.db.rows('notifications')).toHaveLength(3);
  });

  it('dates a notification by the user’s day, not the server’s or UTC’s', async () => {
    await commitmentsService.create(world.client, userId, {
      type: 'TASK',
      title: 'Call the bank',
      dueDate: '2026-09-07',
    });

    // 2026-09-06T19:00Z is already 2026-09-07 in Kolkata — the due date, so it fires.
    // In UTC and in the server's own zone it is still the 6th, when it should not.
    await notificationService.generate(world.client, userId, new Date('2026-09-06T19:00:00Z'), KOLKATA);

    const rows = world.db.rows('notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.scheduled_for).toBe('2026-09-07');
  });

  it('notifies about an unpaid payment from its instance, never from the obligation', async () => {
    const now = new Date('2026-09-06T06:00:00Z');
    await financeService.createObligationWithWindow(
      world.client,
      userId,
      { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
      now,
      KOLKATA,
    );

    await notificationService.generate(world.client, userId, now, KOLKATA);

    const rows = world.db.rows('notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe('due_payment');
    expect(rows[0]!.instance_id).not.toBeNull();
    expect(rows[0]!.commitment_id).toBeNull();
    expect(String(rows[0]!.body)).toContain('42500.00');
  });

  it('stops notifying about a payment once it is marked paid', async () => {
    const now = new Date('2026-09-06T06:00:00Z');
    await financeService.createObligationWithWindow(
      world.client,
      userId,
      { accountName: 'Home loan', obligationType: 'emi', amount: 42500, currency: 'INR', dueDay: 5 },
      now,
      KOLKATA,
    );
    await financeService.markPaid(world.client, userId, { accountName: 'Home loan' }, now, KOLKATA);

    const tomorrow = new Date('2026-09-07T06:00:00Z');
    expect(await notificationService.generate(world.client, userId, tomorrow, KOLKATA)).toBe(0);
  });
});

describe('notification inbox', () => {
  const now = new Date('2026-09-06T06:00:00Z');

  beforeEach(async () => {
    for (const title of ['Renew the policy', 'Call the bank', 'Pay the fees']) {
      await commitmentsService.create(world.client, userId, { type: 'TASK', title, dueDate: '2026-09-06' });
    }
  });

  it('counts only pending notifications as unread', async () => {
    const inbox = await notificationService.getInbox(world.client, userId, now, KOLKATA);
    expect(inbox.unreadCount).toBe(3);

    await notificationService.setStatus(world.client, userId, inbox.notifications[0]!.id, 'read');
    const after = await notificationService.getInbox(world.client, userId, now, KOLKATA);

    expect(after.unreadCount).toBe(2);
    // A read notification stays in the inbox; only a dismissed one leaves.
    expect(after.notifications).toHaveLength(3);
  });

  it('marks everything read in one call and reports how many changed', async () => {
    await notificationService.getInbox(world.client, userId, now, KOLKATA);

    expect(await notificationService.markAllRead(world.client, userId)).toBe(3);
    // Idempotent: nothing is left pending, so a second call changes nothing.
    expect(await notificationService.markAllRead(world.client, userId)).toBe(0);
  });

  it('never counts another user’s notifications', async () => {
    await commitmentsService.create(world.client, world.bob.record.id, {
      type: 'TASK',
      title: 'Bob’s task',
      dueDate: '2026-09-06',
    });
    await notificationService.getInbox(world.client, world.bob.record.id, now, KOLKATA);

    const alice = await notificationService.getInbox(world.client, userId, now, KOLKATA);
    expect(alice.unreadCount).toBe(3);
    expect(await notificationsRepository.countPending(world.client, world.bob.record.id)).toBe(1);
  });

  it('leaves another user’s notifications alone when marking all read', async () => {
    await commitmentsService.create(world.client, world.bob.record.id, {
      type: 'TASK',
      title: 'Bob’s task',
      dueDate: '2026-09-06',
    });
    await notificationService.getInbox(world.client, world.bob.record.id, now, KOLKATA);
    await notificationService.getInbox(world.client, userId, now, KOLKATA);

    await notificationService.markAllRead(world.client, userId);

    expect(await notificationsRepository.countPending(world.client, world.bob.record.id)).toBe(1);
  });

  it('refuses to change a notification that belongs to someone else', async () => {
    await commitmentsService.create(world.client, world.bob.record.id, {
      type: 'TASK',
      title: 'Bob’s task',
      dueDate: '2026-09-06',
    });
    const bobsInbox = await notificationService.getInbox(world.client, world.bob.record.id, now, KOLKATA);

    const result = await notificationService.setStatus(
      world.client,
      userId,
      bobsInbox.notifications[0]!.id,
      'dismissed',
    );

    expect(result).toBeNull();
    expect(world.db.rows('notifications').find((row) => row.id === bobsInbox.notifications[0]!.id)!.status).toBe(
      'pending',
    );
  });
});
