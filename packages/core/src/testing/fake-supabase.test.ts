/**
 * Tests for the test harness itself.
 *
 * The fake is only worth anything if it behaves like PostgREST where the repositories
 * depend on that behaviour: numeric comes back as a string, a missing row is `null`
 * rather than an error under maybeSingle, a unique violation is a 23505, and a cascade
 * really removes children. A fake that quietly diverges would turn the whole Phase 9
 * suite into a test of itself.
 */

import { describe, expect, it } from 'vitest';
import { createFakeSupabase, FakeDatabase } from './fake-supabase';
import { createTestWorld } from './fixtures';

describe('fake supabase — PostgREST behaviours the repositories rely on', () => {
  it('returns numeric columns as strings, the way PostgREST does', async () => {
    const world = createTestWorld();
    const { data } = await world.fake
      .from('financial_obligations')
      .insert({
        user_id: world.alice.record.id,
        commitment_id: 'c1',
        account_name: 'Home loan',
        obligation_type: 'emi',
        amount: 42500,
        currency: 'INR',
        due_day: 5,
        recurrence_rule: 'monthly',
      })
      .select()
      .single();

    expect((data as Record<string, unknown>).amount).toBe('42500');
  });

  it('maybeSingle returns null for no rows, single returns PGRST116', async () => {
    const world = createTestWorld();

    const maybe = await world.fake.from('memories').select().eq('id', 'nope').maybeSingle();
    expect(maybe.data).toBeNull();
    expect(maybe.error).toBeNull();

    const strict = await world.fake.from('memories').select().eq('id', 'nope').single();
    expect(strict.data).toBeNull();
    expect(strict.error?.code).toBe('PGRST116');
  });

  it('raises 23505 on a unique violation instead of writing a second row', async () => {
    const world = createTestWorld();
    const base = {
      user_id: world.alice.record.id,
      obligation_id: 'obligation-1',
      period: '2026-09',
      expected_amount: 1000,
    };

    const first = await world.fake.from('financial_instances').insert(base).select().single();
    expect(first.error).toBeNull();

    const second = await world.fake.from('financial_instances').insert(base).select().single();
    expect(second.error?.code).toBe('23505');
    expect(world.db.rows('financial_instances')).toHaveLength(1);
  });

  it('honours a partial unique index: two superseded rows may share a key, two current ones may not', async () => {
    const world = createTestWorld();
    const memory = (effectiveTo: string | null) => ({
      user_id: world.alice.record.id,
      memory_type: 'preference',
      key: 'wake_time',
      value_json: { text: '6am' },
      source: 'user_stated',
      effective_from: '2026-01-01',
      effective_to: effectiveTo,
    });

    expect((await world.fake.from('memories').insert(memory('2026-02-01')).select().single()).error).toBeNull();
    expect((await world.fake.from('memories').insert(memory('2026-03-01')).select().single()).error).toBeNull();
    expect((await world.fake.from('memories').insert(memory(null)).select().single()).error).toBeNull();

    const clash = await world.fake.from('memories').insert(memory(null)).select().single();
    expect(clash.error?.code).toBe('23505');
  });

  it('cascades a user delete through every user-owned table', async () => {
    const world = createTestWorld();
    const alice = world.alice.record.id;

    world.db.rows('commitments').push(
      world.db.applyDefaults('commitments', { user_id: alice, type: 'TASK', title: 'x', source: 'chat' }),
    );
    world.db.rows('memories').push(
      world.db.applyDefaults('memories', {
        user_id: alice,
        memory_type: 'fact',
        key: 'k',
        value_json: {},
        source: 'user_stated',
        effective_from: '2026-01-01',
      }),
    );
    const bobCommitments = world.db.rows('commitments').length;

    await world.fake.from('users').delete().eq('id', alice);

    expect(world.db.rows('commitments').filter((row) => row.user_id === alice)).toHaveLength(0);
    expect(world.db.rows('memories').filter((row) => row.user_id === alice)).toHaveLength(0);
    expect(world.db.rows('users').map((row) => row.id)).toEqual([world.bob.record.id]);
    expect(bobCommitments).toBe(1);
  });

  it('applies .or() the way the memory effective-date query needs', async () => {
    const world = createTestWorld();
    const insert = (key: string, effectiveTo: string | null) =>
      world.db.rows('memories').push(
        world.db.applyDefaults('memories', {
          user_id: world.alice.record.id,
          memory_type: 'fact',
          key,
          value_json: {},
          source: 'user_stated',
          effective_from: '2026-01-01',
          effective_to: effectiveTo,
        }),
      );

    insert('still-current', null);
    insert('ends-later', '2026-06-01');
    insert('already-ended', '2026-02-01');

    const { data } = await world.fake
      .from('memories')
      .select()
      .eq('user_id', world.alice.record.id)
      .lte('effective_from', '2026-03-01')
      .or('effective_to.is.null,effective_to.gt.2026-03-01');

    expect((data as Record<string, unknown>[]).map((row) => row.key).sort()).toEqual([
      'ends-later',
      'still-current',
    ]);
  });

  it('sorts nulls last ascending and first descending, as Postgres does', async () => {
    const db = new FakeDatabase();
    const fake = createFakeSupabase(db);
    for (const dueDate of ['2026-03-01', null, '2026-01-01']) {
      db.rows('commitments').push(
        db.applyDefaults('commitments', {
          user_id: 'u',
          type: 'TASK',
          title: String(dueDate),
          source: 'chat',
          due_date: dueDate,
        }),
      );
    }

    const ascending = await fake.from('commitments').select().order('due_date', { ascending: true });
    expect((ascending.data as Record<string, unknown>[]).map((row) => row.due_date)).toEqual([
      '2026-01-01',
      '2026-03-01',
      null,
    ]);

    const descending = await fake.from('commitments').select().order('due_date', { ascending: false });
    expect((descending.data as Record<string, unknown>[]).map((row) => row.due_date)).toEqual([
      null,
      '2026-03-01',
      '2026-01-01',
    ]);
  });

  it('counts with head:true without returning rows', async () => {
    const world = createTestWorld();
    for (const status of ['pending', 'pending', 'read']) {
      world.db.rows('notifications').push(
        world.db.applyDefaults('notifications', {
          user_id: world.alice.record.id,
          commitment_id: 'c',
          type: 'task',
          title: 't',
          body: 'b',
          scheduled_for: '2026-09-06',
          status,
          dedupe_key: `k-${status}-${Math.random()}`,
        }),
      );
    }

    const { data, count } = await world.fake
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', world.alice.record.id)
      .eq('status', 'pending');

    expect(data).toBeNull();
    expect(count).toBe(2);
  });

  it('leaves an existing row untouched when upserting with ignoreDuplicates', async () => {
    const world = createTestWorld();
    const row = {
      user_id: world.alice.record.id,
      commitment_id: 'c1',
      type: 'task',
      title: 'original',
      body: 'b',
      scheduled_for: '2026-09-06',
      dedupe_key: 'dedupe-1',
    };

    await world.fake.from('notifications').upsert(row, { onConflict: 'user_id,dedupe_key' }).select('id');
    await world.fake
      .from('notifications')
      .update({ status: 'dismissed' })
      .eq('dedupe_key', 'dedupe-1')
      .select();

    const { data } = await world.fake
      .from('notifications')
      .upsert({ ...row, title: 'regenerated' }, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
      .select('id');

    expect(data).toEqual([]);
    expect(world.db.rows('notifications')).toHaveLength(1);
    expect(world.db.rows('notifications')[0]!.title).toBe('original');
    expect(world.db.rows('notifications')[0]!.status).toBe('dismissed');
  });

  it('rejects a write to an unknown table rather than inventing one', () => {
    const db = new FakeDatabase();
    expect(() => db.rows('not_a_table')).toThrow(/Unknown table/);
  });
});
