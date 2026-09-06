/**
 * Phase 9 — recurring finance, timezone and duplicate writes, against real rows.
 *
 * The existing finance tests cover the pure functions. These run the whole service over
 * the in-memory database, so the parts that only exist once rows do — the unique
 * (obligation_id, period) constraint, the expected_amount snapshot, generation over an
 * existing series — are exercised rather than assumed.
 *
 * The suite runs under America/Los_Angeles (vitest.config.ts) while the users live in
 * Asia/Kolkata, so any calculation that quietly used the server's zone lands on the
 * wrong calendar day and fails here.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as financeService from './finance-service';
import * as financialRepository from '../../repositories/financial-repository';
import { createTestWorld, type TestWorld } from '../../testing/fixtures';

const KOLKATA = 'Asia/Kolkata';

let world: TestWorld;

beforeEach(() => {
  world = createTestWorld({ timezone: KOLKATA });
});

async function createHomeLoan(
  now: Date,
  overrides: Partial<Parameters<typeof financeService.createObligationWithWindow>[2]> = {},
) {
  return financeService.createObligationWithWindow(
    world.client,
    world.alice.record.id,
    {
      accountName: 'Home loan',
      obligationType: 'emi',
      amount: 42500,
      currency: 'INR',
      dueDay: 5,
      ...overrides,
    },
    now,
    KOLKATA,
  );
}

describe('finance — timezone', () => {
  it('puts a payment made at 11pm on the 5th in Kolkata on the 5th, not the 6th', async () => {
    // 2026-09-05T23:30 in Kolkata is 2026-09-05T18:00Z — and 11am the same day in the
    // server's own zone, so only an explicitly Kolkata-based calculation gets this right.
    const now = new Date('2026-09-05T18:00:00Z');
    const { obligation } = await createHomeLoan(now);

    const result = await financeService.markPaid(
      world.client,
      world.alice.record.id,
      { accountName: 'Home loan' },
      now,
      KOLKATA,
    );

    expect(result.status).toBe('updated');
    if (result.status !== 'updated') return;
    expect(result.instance.paidDate).toBe('2026-09-05');
    expect(result.instance.period).toBe('2026-09');
    expect(result.instance.obligationId).toBe(obligation.id);
  });

  it('rolls the period over at the user’s midnight, not the server’s or UTC’s', async () => {
    // 2026-09-30T19:00Z is 2026-10-01T00:30 in Kolkata — a new month for the user, and
    // still September both in UTC and in the server's zone.
    const beforeMidnight = new Date('2026-09-30T18:00:00Z');
    const afterMidnight = new Date('2026-09-30T19:00:00Z');

    expect(financeService.currentPeriod(beforeMidnight, KOLKATA)).toBe('2026-09');
    expect(financeService.currentPeriod(afterMidnight, KOLKATA)).toBe('2026-10');
    // The same instant is still September for a user in UTC.
    expect(financeService.currentPeriod(afterMidnight, 'UTC')).toBe('2026-09');
  });

  it('decides overdue against today in the user’s timezone', async () => {
    const created = new Date('2026-09-01T06:00:00Z');
    await createHomeLoan(created, { dueDay: 5 });

    // 2026-09-05T19:00Z is already the 6th in Kolkata, so the 5th is behind them.
    const stillTheFifth = await financeService.getSummary(
      world.client,
      world.alice.record.id,
      new Date('2026-09-05T18:00:00Z'),
      KOLKATA,
    );
    const nowTheSixth = await financeService.getSummary(
      world.client,
      world.alice.record.id,
      new Date('2026-09-05T19:00:00Z'),
      KOLKATA,
    );

    expect(stillTheFifth.today).toBe('2026-09-05');
    expect(stillTheFifth.overdue).toHaveLength(0);
    expect(nowTheSixth.today).toBe('2026-09-06');
    expect(nowTheSixth.overdue).toHaveLength(1);
  });

  it('gives two users in different zones different answers for the same instant', async () => {
    const instant = new Date('2026-09-30T19:00:00Z');
    expect(financeService.currentPeriod(instant, 'Asia/Kolkata')).toBe('2026-10');
    expect(financeService.currentPeriod(instant, 'America/New_York')).toBe('2026-09');
  });
});

describe('finance — recurring obligations', () => {
  it('clamps a 31st due day to the last day of a short month rather than rolling over', async () => {
    const now = new Date('2026-01-10T06:00:00Z');
    const { obligation } = await createHomeLoan(now, { accountName: 'Rent', dueDay: 31 });

    await financeService.generateInstances(
      world.client,
      world.alice.record.id,
      obligation.id,
      '2026-01',
      '2026-04',
    );

    const views = await financeService.listInstances(
      world.client,
      world.alice.record.id,
      '2026-02',
      now,
      KOLKATA,
    );
    expect(views[0]!.state.dueDate).toBe('2026-02-28');

    const april = await financeService.listInstances(
      world.client,
      world.alice.record.id,
      '2026-04',
      now,
      KOLKATA,
    );
    expect(april[0]!.state.dueDate).toBe('2026-04-30');
  });

  it('snapshots expected_amount, so raising the EMI never rewrites history', async () => {
    const now = new Date('2026-09-01T06:00:00Z');
    const { obligation } = await createHomeLoan(now);
    await financeService.generateInstances(
      world.client,
      world.alice.record.id,
      obligation.id,
      '2026-09',
      '2026-10',
    );

    // The arrangement itself changes: the obligation row is edited, instances are not.
    world.db.rows('financial_obligations').find((row) => row.id === obligation.id)!.amount = '50000';

    const existing = await financialRepository.listInstancesForObligation(
      world.client,
      world.alice.record.id,
      obligation.id,
    );
    for (const instance of existing) expect(instance.expectedAmount).toBe('42500');

    // Only periods created *after* the change carry the new amount. December is past
    // the window createObligationWithWindow already seeded, so this really is new.
    const [december] = await financeService.generateInstances(
      world.client,
      world.alice.record.id,
      obligation.id,
      '2026-12',
      '2026-12',
    );
    expect(december!.expectedAmount).toBe('50000');
  });

  it('never generates an unbounded series', async () => {
    const now = new Date('2026-01-01T06:00:00Z');
    const { obligation } = await createHomeLoan(now);

    const created = await financeService.generateInstances(
      world.client,
      world.alice.record.id,
      obligation.id,
      '2026-01',
      '2099-12',
    );

    expect(created.length).toBeLessThanOrEqual(24);
  });

  it('groups a monthly total by currency and never mixes them', async () => {
    const now = new Date('2026-09-01T06:00:00Z');
    await createHomeLoan(now, { accountName: 'Home loan', amount: 42500, currency: 'INR' });
    await createHomeLoan(now, { accountName: 'Rent', amount: 18000, currency: 'INR' });
    await createHomeLoan(now, { accountName: 'Hosting', amount: 20, currency: 'USD', obligationType: 'subscription' });

    const requirement = await financeService.calculateMonthlyRequirement(
      world.client,
      world.alice.record.id,
      now,
      KOLKATA,
    );

    const byCurrency = Object.fromEntries(
      requirement.breakdown.map((row) => [row.currency, row.totalFormatted]),
    );
    expect(byCurrency).toEqual({ INR: '60500.00', USD: '20.00' });
    expect(requirement.breakdown).toHaveLength(2);
  });

  it('keeps historical instances when the obligation’s commitment is cancelled', async () => {
    const now = new Date('2026-09-01T06:00:00Z');
    const { obligation } = await createHomeLoan(now);
    const before = world.db.rows('financial_instances').length;

    world.db.rows('commitments').find((row) => row.id === obligation.commitmentId)!.status = 'cancelled';

    expect(world.db.rows('financial_instances')).toHaveLength(before);
    expect(before).toBeGreaterThan(0);
  });

  it('produces the same summary twice for the same rows and the same instant', async () => {
    const now = new Date('2026-09-10T06:00:00Z');
    await createHomeLoan(now);
    await createHomeLoan(now, { accountName: 'Rent', amount: 18000, dueDay: 1 });

    const first = await financeService.getSummary(world.client, world.alice.record.id, now, KOLKATA);
    const second = await financeService.getSummary(world.client, world.alice.record.id, now, KOLKATA);

    expect(second).toEqual(first);
  });
});

describe('finance — duplicate writes', () => {
  const now = new Date('2026-09-10T06:00:00Z');

  it('creates one instance per period however many times generation runs', async () => {
    const { obligation } = await createHomeLoan(now);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await financeService.generateInstances(
        world.client,
        world.alice.record.id,
        obligation.id,
        '2026-09',
        '2026-12',
      );
    }

    const periods = world.db
      .rows('financial_instances')
      .filter((row) => row.obligation_id === obligation.id)
      .map((row) => row.period);
    expect(new Set(periods).size).toBe(periods.length);
    expect(periods.sort()).toEqual(['2026-09', '2026-10', '2026-11', '2026-12']);
  });

  it('converges on one row when two generations race for the same period', async () => {
    const { obligation } = await createHomeLoan(now);

    const params = {
      userId: world.alice.record.id,
      obligationId: obligation.id,
      period: '2027-03',
      expectedAmount: 42500,
    };
    const [first, second] = await Promise.all([
      financialRepository.getOrCreateInstanceForPeriod(world.client, params),
      financialRepository.getOrCreateInstanceForPeriod(world.client, params),
    ]);

    expect(first.id).toBe(second.id);
    expect(
      world.db.rows('financial_instances').filter((row) => row.period === '2027-03'),
    ).toHaveLength(1);
  });

  it('treats re-marking the same amount and date as a no-op success', async () => {
    await createHomeLoan(now);
    const args = { accountName: 'Home loan', amount: 42500, paidDate: '2026-09-05' };

    const first = await financeService.markPaid(world.client, world.alice.record.id, args, now, KOLKATA);
    const second = await financeService.markPaid(world.client, world.alice.record.id, args, now, KOLKATA);
    const third = await financeService.markPaid(world.client, world.alice.record.id, args, now, KOLKATA);

    expect(first.status).toBe('updated');
    expect(second.status).toBe('unchanged');
    expect(third.status).toBe('unchanged');
    expect(world.db.rows('financial_instances').filter((row) => row.period === '2026-09')).toHaveLength(1);
  });

  it('treats a different amount as a correction, not a duplicate', async () => {
    await createHomeLoan(now);

    await financeService.markPaid(
      world.client,
      world.alice.record.id,
      { accountName: 'Home loan', amount: 42500, paidDate: '2026-09-05' },
      now,
      KOLKATA,
    );
    const corrected = await financeService.markPaid(
      world.client,
      world.alice.record.id,
      { accountName: 'Home loan', amount: 40000, paidDate: '2026-09-05' },
      now,
      KOLKATA,
    );

    expect(corrected.status).toBe('updated');
    if (corrected.status !== 'updated') return;
    expect(corrected.wasCorrection).toBe(true);
    // Less than expected, so it is now a partial payment rather than settled.
    expect(corrected.instance.status).toBe('partial');
    expect(corrected.instance.paidAmount).toBe('40000');
    expect(world.db.rows('financial_instances').filter((row) => row.period === '2026-09')).toHaveLength(1);
  });

  it('never writes payment state onto the obligation', async () => {
    const { obligation } = await createHomeLoan(now);
    await financeService.markPaid(
      world.client,
      world.alice.record.id,
      { accountName: 'Home loan' },
      now,
      KOLKATA,
    );

    const row = world.db.rows('financial_obligations').find((r) => r.id === obligation.id)!;
    expect(Object.keys(row)).not.toContain('status');
    expect(Object.keys(row)).not.toContain('paid_amount');
    expect(row.amount).toBe('42500');
  });

  it('leaves an already-paid instance alone when generation runs again', async () => {
    const { obligation } = await createHomeLoan(now);
    await financeService.markPaid(
      world.client,
      world.alice.record.id,
      { accountName: 'Home loan', amount: 42500, paidDate: '2026-09-05' },
      now,
      KOLKATA,
    );

    await financeService.generateInstances(
      world.client,
      world.alice.record.id,
      obligation.id,
      '2026-09',
      '2026-12',
    );

    const september = world.db.rows('financial_instances').find((row) => row.period === '2026-09')!;
    expect(september.status).toBe('paid');
    expect(september.paid_amount).toBe('42500');
    expect(september.paid_date).toBe('2026-09-05');
  });
});
