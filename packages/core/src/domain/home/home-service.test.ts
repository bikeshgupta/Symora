import { describe, expect, it } from 'vitest';
import { buildAttention, buildSuggestions, partOfDay, MAX_ATTENTION_ITEMS } from './home-service';
import type { CommitmentView } from '../../types/commitment';
import type { InstanceView } from '../finance/finance-service';

function payment(id: string, accountName: string, dueDate: string, isOverdue: boolean): InstanceView {
  return {
    instance: {
      id,
      userId: 'u1',
      obligationId: `o-${id}`,
      period: dueDate.slice(0, 7),
      expectedAmount: '42500.00',
      paidAmount: null,
      status: 'pending',
      paidDate: null,
      createdAt: '',
      updatedAt: '',
    },
    obligation: {
      id: `o-${id}`,
      userId: 'u1',
      commitmentId: `c-${id}`,
      accountName,
      obligationType: 'emi',
      amount: '42500.00',
      currency: 'INR',
      dueDay: Number(dueDate.slice(-2)),
      recurrenceRule: 'monthly',
      createdAt: '',
      updatedAt: '',
    },
    state: {
      status: isOverdue ? 'overdue' : 'pending',
      dueDate,
      isOverdue,
      outstandingMinorUnits: '4250000',
      outstandingFormatted: '42500.00',
    },
  };
}

function commitment(overrides: Partial<CommitmentView> & { id: string }): CommitmentView {
  return {
    userId: 'u1',
    type: 'TASK',
    title: 'Something',
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

const TODAY = '2026-09-04';

describe('partOfDay', () => {
  it('reads the hour in the user timezone, not the server one', () => {
    // 03:00Z is 08:30 in Kolkata (morning) but still the small hours in UTC.
    const at0300Z = new Date('2026-09-04T03:00:00.000Z');
    expect(partOfDay(at0300Z, 'Asia/Kolkata')).toBe('morning');
    expect(partOfDay(at0300Z, 'UTC')).toBe('morning');

    // 14:00Z is 19:30 in Kolkata — evening there, afternoon in UTC.
    const at1400Z = new Date('2026-09-04T14:00:00.000Z');
    expect(partOfDay(at1400Z, 'Asia/Kolkata')).toBe('evening');
    expect(partOfDay(at1400Z, 'UTC')).toBe('afternoon');
  });
});

describe('buildAttention', () => {
  it('is empty when nothing needs the user', () => {
    expect(buildAttention({ overduePayments: [], upcomingPayments: [], commitments: [] }, TODAY)).toEqual([]);
  });

  it('puts an overdue payment above everything else', () => {
    const items = buildAttention(
      {
        overduePayments: [payment('p1', 'Home loan', '2026-09-01', true)],
        upcomingPayments: [payment('p2', 'Netflix', '2026-09-06', false)],
        commitments: [
          commitment({ id: 'c1', title: 'Call electrician', urgency: 'due-today', dueDate: TODAY }),
        ],
      },
      TODAY,
    );
    expect(items[0]!.kind).toBe('overdue_payment');
    expect(items[0]!.title).toBe('Home loan');
  });

  it('states lateness in words, never colour alone', () => {
    const items = buildAttention(
      { overduePayments: [payment('p1', 'Home loan', '2026-09-01', true)], upcomingPayments: [], commitments: [] },
      TODAY,
    );
    expect(items[0]!.statusLabel).toBe('3 days late');
  });

  it('says "1 day late" rather than "1 days late"', () => {
    const items = buildAttention(
      { overduePayments: [payment('p1', 'Home loan', '2026-09-03', true)], upcomingPayments: [], commitments: [] },
      TODAY,
    );
    expect(items[0]!.statusLabel).toBe('1 day late');
  });

  it('surfaces an important date within the horizon and labels the countdown', () => {
    const items = buildAttention(
      {
        overduePayments: [],
        upcomingPayments: [],
        commitments: [
          commitment({
            id: 'c1',
            type: 'IMPORTANT_DATE',
            title: "Mom's birthday",
            recurrence: 'yearly',
            nextOccurrence: '2026-09-06',
          }),
        ],
      },
      TODAY,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.statusLabel).toBe('In 2 days');
  });

  it('ignores an important date beyond the horizon', () => {
    const items = buildAttention(
      {
        overduePayments: [],
        upcomingPayments: [],
        commitments: [
          commitment({ id: 'c1', type: 'IMPORTANT_DATE', title: 'Anniversary', nextOccurrence: '2026-12-01' }),
        ],
      },
      TODAY,
    );
    expect(items).toEqual([]);
  });

  it('ignores an upcoming payment beyond a week out', () => {
    const items = buildAttention(
      { overduePayments: [], upcomingPayments: [payment('p1', 'Rent', '2026-09-30', false)], commitments: [] },
      TODAY,
    );
    expect(items).toEqual([]);
  });

  it('caps the list so a glance is still enough', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      payment(`p${i}`, `Loan ${i}`, '2026-09-01', true),
    );
    expect(buildAttention({ overduePayments: many, upcomingPayments: [], commitments: [] }, TODAY)).toHaveLength(
      MAX_ATTENTION_ITEMS,
    );
  });

  it('is deterministic — the same data always renders in the same order', () => {
    const input = {
      overduePayments: [payment('p2', 'B loan', '2026-09-01', true), payment('p1', 'A loan', '2026-09-01', true)],
      upcomingPayments: [],
      commitments: [],
    };
    const first = buildAttention(input, TODAY).map((item) => item.id);
    const second = buildAttention(
      { ...input, overduePayments: [...input.overduePayments].reverse() },
      TODAY,
    ).map((item) => item.id);
    expect(first).toEqual(second);
  });

  it('never lists a done commitment as needing attention', () => {
    const items = buildAttention(
      {
        overduePayments: [],
        upcomingPayments: [],
        commitments: [commitment({ id: 'c1', status: 'done', urgency: null, dueDate: '2026-09-01' })],
      },
      TODAY,
    );
    expect(items).toEqual([]);
  });
});

describe('buildSuggestions', () => {
  it('offers to mark an overdue payment paid when there is one', () => {
    const attention = buildAttention(
      { overduePayments: [payment('p1', 'Home loan', '2026-09-01', true)], upcomingPayments: [], commitments: [] },
      TODAY,
    );
    const suggestions = buildSuggestions({ attention, hasPayments: true, hasCommitments: true });
    expect(suggestions[0]!.id).toBe('mark-overdue-paid');
    expect(suggestions[0]!.prompt).toContain('Home loan');
  });

  it('nudges a brand-new user toward their first payment instead of "what is pending"', () => {
    const suggestions = buildSuggestions({ attention: [], hasPayments: false, hasCommitments: false });
    expect(suggestions.map((s) => s.id)).toContain('first-payment');
    expect(suggestions.map((s) => s.id)).not.toContain('what-is-pending');
  });

  it('never floods the input with chips', () => {
    const attention = buildAttention(
      {
        overduePayments: [payment('p1', 'Home loan', '2026-09-01', true)],
        upcomingPayments: [],
        commitments: [commitment({ id: 'c1', title: 'Call electrician', urgency: 'overdue', dueDate: '2026-09-01' })],
      },
      TODAY,
    );
    expect(buildSuggestions({ attention, hasPayments: true, hasCommitments: true }).length).toBeLessThanOrEqual(4);
  });
});
