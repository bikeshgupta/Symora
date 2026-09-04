import { describe, expect, it } from 'vitest';
import { scoreMemory, selectRelevantMemories, tokenize, type ScorableMemory } from './relevance';

const memories: ScorableMemory[] = [
  { memoryType: 'alias', key: 'mummy', text: 'Sunita Sharma' },
  { memoryType: 'fact', key: 'spouse_name', text: 'Ravi' },
  { memoryType: 'preference', key: 'reminder_lead_time', text: '2 days before' },
  { memoryType: 'fact', key: 'electrician', text: 'Ashok, 9876543210' },
];

describe('tokenize', () => {
  it('drops English and Hinglish function words', () => {
    expect(tokenize('remind me to call the electrician')).toEqual(['call', 'electrician']);
    expect(tokenize('mummy ko call karna hai')).toEqual(['mummy', 'call']);
  });

  it('keeps Devanagari words intact', () => {
    expect(tokenize('बिजली वाले को फोन')).toContain('बिजली');
  });

  it('ignores single characters and punctuation', () => {
    expect(tokenize('a b, electrician!')).toEqual(['electrician']);
  });
});

describe('scoreMemory', () => {
  it('scores zero when nothing in the message matches', () => {
    expect(scoreMemory(memories[0]!, tokenize('what is pending this month'))).toBe(0);
  });

  it('weights a key match above a value match', () => {
    const byKey = scoreMemory({ memoryType: 'fact', key: 'ravi', text: 'x' }, tokenize('ravi'));
    const byValue = scoreMemory({ memoryType: 'fact', key: 'spouse_name', text: 'ravi' }, tokenize('ravi'));
    expect(byKey).toBeGreaterThan(byValue);
  });

  it('treats an underscored key as separate words', () => {
    expect(scoreMemory(memories[2]!, tokenize('what is my reminder lead time'))).toBeGreaterThan(0);
  });
});

describe('selectRelevantMemories (ai-pipeline.md: only what this intent needs)', () => {
  it('returns nothing when no memory is relevant', () => {
    expect(selectRelevantMemories({ memories, text: 'how much is due this month' })).toEqual([]);
  });

  it('surfaces the alias the message actually mentions', () => {
    const selected = selectRelevantMemories({ memories, text: 'mummy ko call karna hai' });
    expect(selected).toHaveLength(1);
    expect(selected[0]!.key).toBe('mummy');
  });

  it('never returns the whole memory set just because one thing matched', () => {
    const selected = selectRelevantMemories({ memories, text: 'call the electrician' });
    expect(selected.map((m) => m.key)).toEqual(['electrician']);
  });

  it('honours the limit', () => {
    const many: ScorableMemory[] = Array.from({ length: 20 }, (_, i) => ({
      memoryType: 'fact',
      key: `electrician_${i}`,
      text: 'Ashok',
    }));
    expect(selectRelevantMemories({ memories: many, text: 'electrician', limit: 3 })).toHaveLength(3);
  });

  it('is deterministic — the same inputs always produce the same order', () => {
    const first = selectRelevantMemories({ memories, text: 'mummy and the electrician' });
    const second = selectRelevantMemories({ memories: [...memories].reverse(), text: 'mummy and the electrician' });
    expect(first.map((m) => m.key)).toEqual(second.map((m) => m.key));
  });

  it('prefers the types an intent leans on when scores tie', () => {
    const tied: ScorableMemory[] = [
      { memoryType: 'preference', key: 'ravi', text: 'formal tone' },
      { memoryType: 'alias', key: 'ravi', text: 'spouse' },
    ];
    const selected = selectRelevantMemories({ memories: tied, text: 'draft a note to ravi', intent: 'draft_message' });
    expect(selected[0]!.memoryType).toBe('alias');
  });
});
