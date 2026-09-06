import { describe, expect, it } from 'vitest';
import {
  buildDedupeKey,
  planCommitmentNotifications,
  planNotifications,
  planPaymentNotifications,
} from './notification-planner';
import type { CommitmentView } from '../../types/commitment';
import type { InstanceView } from '../finance/finance-service';

const TODAY = '2026-09-04';

function instance(id: string, dueDate: string, status: 'pending' | 'paid' | 'partial' | 'skipped'): InstanceView {
  return {
    instance: {
      id,
      userId: 'u1',
      obligationId: `o-${id}`,
      period: dueDate.slice(0, 7),
      expectedAmount: '42500.00',
      paidAmount: status === 'partial' ? '20000.00' : null,
      status,
      paidDate: null,
      createdAt: '',
      updatedAt: '',
    },
    obligation: {
      id: `o-${id}`,
      userId: 'u1',
      commitmentId: `c-${id}`,
      accountName: 'Home loan',
      obligationType: 'emi',
      amount: '42500.00',
      currency: 'INR',
      dueDay: 5,
      recurrenceRule: 'monthly',
      createdAt: '',
      updatedAt: '',
    },
    state: {
      status,
      dueDate,
      isOverdue: status !== 'paid' && status !== 'skipped' && dueDate < TODAY,
      outstandingMinorUnits: '4250000',
      outstandingFormatted: status === 'partial' ? '22500.00' : '42500.00',
    },
  };
}

function commitment(overrides: Partial<CommitmentView> & { id: string }): CommitmentView {
  return {
    userId: 'u1',
    type: 'TASK',
    title: 'Call the electrician',
    description: null,
    dueDate: null,
    dueTime: null,
    recurrenceRule: null,
    leadDays: null,
    status: 'pending',
    priority: 'normal',
    source: 'chat',
    createdAt: '',
    updatedAt: '',
    recurrence: 'none',
    nextOccurrence: null,
    fireDate: null,
    urgency: null,
    ...overrides,
  };
}

describe('buildDedupeKey', () => {
  it('includes the date, so a monthly reminder can fire again next month', () => {
    const september = buildDedupeKey('commitment', 'c1', 'reminder', '2026-09-04');
    const october = buildDedupeKey('commitment', 'c1', 'reminder', '2026-10-04');
    expect(september).not.toBe(october);
  });

  it('is stable for the same source, type and day', () => {
    expect(buildDedupeKey('instance', 'i1', 'due_payment', TODAY)).toBe(
      buildDedupeKey('instance', 'i1', 'due_payment', TODAY),
    );
  });
});

describe('planPaymentNotifications', () => {
  it('fires on the due date', () => {
    const planned = planPaymentNotifications([instance('i1', TODAY, 'pending')], TODAY);
    expect(planned).toHaveLength(1);
    expect(planned[0]!.body).toContain('is due today');
  });

  it('keeps firing while it stays overdue, and says how late', () => {
    const planned = planPaymentNotifications([instance('i1', '2026-09-01', 'pending')], TODAY);
    expect(planned[0]!.body).toContain('was due 3 days ago');
  });

  it('says "yesterday" rather than "1 days ago"', () => {
    const planned = planPaymentNotifications([instance('i1', '2026-09-03', 'pending')], TODAY);
    expect(planned[0]!.body).toContain('was due yesterday');
  });

  it('stays quiet for a payment still comfortably ahead', () => {
    expect(planPaymentNotifications([instance('i1', '2026-09-20', 'pending')], TODAY)).toEqual([]);
  });

  it('never nags about something already paid or skipped', () => {
    expect(planPaymentNotifications([instance('i1', '2026-09-01', 'paid')], TODAY)).toEqual([]);
    expect(planPaymentNotifications([instance('i2', '2026-09-01', 'skipped')], TODAY)).toEqual([]);
  });

  it('still chases a partial payment, for the remainder', () => {
    const planned = planPaymentNotifications([instance('i1', '2026-09-01', 'partial')], TODAY);
    expect(planned).toHaveLength(1);
    expect(planned[0]!.body).toContain('22500.00');
  });
});

describe('planCommitmentNotifications', () => {
  it('fires on the due date', () => {
    const planned = planCommitmentNotifications([commitment({ id: 'c1', dueDate: TODAY })], TODAY);
    expect(planned).toHaveLength(1);
    expect(planned[0]!.type).toBe('task');
  });

  it('fires early when a lead time is set, and says what it is about', () => {
    // Due the 6th with 2 days' lead → fires on the 4th.
    const planned = planCommitmentNotifications(
      [commitment({ id: 'c1', type: 'REMINDER', dueDate: '2026-09-06', leadDays: 2 })],
      TODAY,
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]!.body).toContain('Coming up on 2026-09-06');
    expect(planned[0]!.type).toBe('reminder');
  });

  it('stays quiet between the lead date and the due date', () => {
    // Due the 10th with 2 days' lead fires on the 8th, not today.
    expect(
      planCommitmentNotifications(
        [commitment({ id: 'c1', type: 'REMINDER', dueDate: '2026-09-10', leadDays: 2 })],
        TODAY,
      ),
    ).toEqual([]);
  });

  it('keeps firing while overdue', () => {
    const planned = planCommitmentNotifications(
      [commitment({ id: 'c1', dueDate: '2026-09-01', urgency: 'overdue' })],
      TODAY,
    );
    expect(planned).toHaveLength(1);
  });

  it('ignores anything not pending', () => {
    expect(
      planCommitmentNotifications([commitment({ id: 'c1', dueDate: TODAY, status: 'done' })], TODAY),
    ).toEqual([]);
  });

  it('ignores an undated commitment — there is no day to fire on', () => {
    expect(planCommitmentNotifications([commitment({ id: 'c1' })], TODAY)).toEqual([]);
  });

  it('leaves PAYMENT commitments to their instances, so nothing is announced twice', () => {
    expect(
      planCommitmentNotifications([commitment({ id: 'c1', type: 'PAYMENT', dueDate: TODAY })], TODAY),
    ).toEqual([]);
  });

  it('uses a recurring commitment’s next occurrence, not its original anchor', () => {
    const planned = planCommitmentNotifications(
      [
        commitment({
          id: 'c1',
          type: 'IMPORTANT_DATE',
          title: "Mom's birthday",
          dueDate: '1990-09-04',
          recurrence: 'yearly',
          nextOccurrence: TODAY,
        }),
      ],
      TODAY,
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]!.type).toBe('important_date');
  });
});

describe('planNotifications', () => {
  it('produces one entry per source and no duplicate keys', () => {
    const planned = planNotifications(
      {
        instances: [instance('i1', TODAY, 'pending')],
        commitments: [commitment({ id: 'c1', dueDate: TODAY })],
      },
      TODAY,
    );
    expect(planned).toHaveLength(2);
    expect(new Set(planned.map((p) => p.dedupeKey)).size).toBe(2);
  });

  it('is deterministic — planning twice for the same day gives identical keys', () => {
    const input = {
      instances: [instance('i1', TODAY, 'pending')],
      commitments: [commitment({ id: 'c1', dueDate: TODAY })],
    };
    expect(planNotifications(input, TODAY).map((p) => p.dedupeKey)).toEqual(
      planNotifications(input, TODAY).map((p) => p.dedupeKey),
    );
  });
});
