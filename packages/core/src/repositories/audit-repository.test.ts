/**
 * Phase 9 — .claude/rules/auth-security.md § Row Level Security: "audit_events is
 * append-only: policies grant insert and select, never update or delete."
 *
 * The database half of that is migration 0010 (audited by migrations.test.ts). This is
 * the application half: no code path anywhere updates or deletes an audit row, and the
 * repository offers no way to. Enforced by reading the source rather than by convention,
 * because convention is what erodes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as auditRepository from './audit-repository';
import { createTestWorld } from '../testing/fixtures';

const SRC = join(import.meta.dirname, '..', '..', '..', '..');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

describe('audit repository — surface', () => {
  it('exposes only insert and select', () => {
    expect(Object.keys(auditRepository).sort()).toEqual(['listAuditEvents', 'recordAuditEvent']);
  });

  it('writes and reads back a row', async () => {
    const world = createTestWorld();
    await auditRepository.recordAuditEvent(world.client, {
      userId: world.alice.record.id,
      action: 'access_denied',
      targetTable: 'memories',
      targetId: 'some-id',
      detail: { code: 'NOT_FOUND' },
      requestId: 'req-1',
    });

    const rows = await auditRepository.listAuditEvents(world.client, world.alice.record.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'access_denied', targetId: 'some-id', requestId: 'req-1' });
  });

  it('never returns another user’s audit rows', async () => {
    const world = createTestWorld();
    await auditRepository.recordAuditEvent(world.client, {
      userId: world.alice.record.id,
      action: 'memory_deleted',
      targetId: 'alice-memory',
    });

    expect(await auditRepository.listAuditEvents(world.client, world.bob.record.id)).toEqual([]);
  });

  it('rejects an update or delete at the storage layer', async () => {
    const world = createTestWorld();
    await auditRepository.recordAuditEvent(world.client, {
      userId: world.alice.record.id,
      action: 'access_denied',
    });

    const updated = await world.fake.from('audit_events').update({ action: 'memory_deleted' }).eq('user_id', world.alice.record.id);
    const deleted = await world.fake.from('audit_events').delete().eq('user_id', world.alice.record.id);

    expect(updated.error).not.toBeNull();
    expect(deleted.error).not.toBeNull();
    expect(world.db.rows('audit_events')).toHaveLength(1);
  });
});

describe('audit_events is append-only across the whole codebase', () => {
  const files = [
    ...sourceFiles(join(SRC, 'packages', 'core', 'src')),
    ...sourceFiles(join(SRC, 'api')),
  ];

  it('found the source to check', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('has no update or delete against audit_events anywhere', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Only this repository may name the table at all, so a stray query elsewhere is
      // itself the thing to catch.
      if (!source.includes("'audit_events'")) continue;
      expect(file, `${file} queries audit_events outside its repository`).toContain(
        'audit-repository.ts',
      );
      expect(source).not.toMatch(/from\('audit_events'\)[\s\S]{0,80}\.(?:update|delete)\(/);
    }
  });
});
