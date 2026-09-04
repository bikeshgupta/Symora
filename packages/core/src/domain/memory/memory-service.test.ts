import { describe, expect, it } from 'vitest';
import { normalizeKey, toView } from './memory-service';
import type { MemoryRecord } from '../../types/memory';

const record: MemoryRecord = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  memoryType: 'alias',
  key: 'mummy',
  valueJson: { text: 'Sunita Sharma' },
  source: 'user_stated',
  confidence: 1,
  effectiveFrom: '2026-03-01',
  effectiveTo: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
};

describe('normalizeKey', () => {
  it('lowercases, trims and underscores so lookups match exactly', () => {
    expect(normalizeKey('  Spouse Name ')).toBe('spouse_name');
  });

  it('is idempotent', () => {
    expect(normalizeKey(normalizeKey('Spouse Name'))).toBe('spouse_name');
  });
});

describe('toView', () => {
  it('parses the stored text and marks a current memory current', () => {
    const view = toView(record, '2026-09-04');
    expect(view.text).toBe('Sunita Sharma');
    expect(view.isCurrent).toBe(true);
  });

  it('marks a superseded memory as not current but still returns it', () => {
    const view = toView({ ...record, effectiveTo: '2026-06-01' }, '2026-09-04');
    expect(view.isCurrent).toBe(false);
    expect(view.text).toBe('Sunita Sharma');
  });

  it('degrades to empty text rather than throwing on a malformed value', () => {
    const view = toView({ ...record, valueJson: { wrong: 'shape' } }, '2026-09-04');
    expect(view.text).toBe('');
  });

  it('never exposes the owning user id', () => {
    expect(Object.keys(toView(record, '2026-09-04'))).not.toContain('userId');
  });
});
