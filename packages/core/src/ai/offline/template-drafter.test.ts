import { describe, expect, it } from 'vitest';
import { draftMessageOffline } from './template-drafter';

describe('draftMessageOffline', () => {
  it('produces both variants, so the draft card and handoff work unchanged', () => {
    const draft = draftMessageOffline({ context: 'Can you come on Saturday morning?' }, 'en');
    expect(draft.short.length).toBeGreaterThan(0);
    expect(draft.detailed.length).toBeGreaterThan(draft.short.length);
  });

  it('reports zero usage and names itself a template', () => {
    const draft = draftMessageOffline({ context: 'anything' }, 'en');
    expect(draft.usage.totalTokens).toBe(0);
    expect(draft.model).toBe('offline-template');
  });

  it('replies in the language the user used', () => {
    expect(draftMessageOffline({ context: 'kal aa sakte ho' }, 'hinglish').detailed).toContain('Umeed hai');
    expect(draftMessageOffline({ context: 'कल आ सकते हैं' }, 'hi').detailed).toContain('नमस्ते');
  });

  it('does not greet a relationship word as if it were a name', () => {
    // "Hi electrician" reads worse than a plain "Hi".
    const draft = draftMessageOffline(
      { context: 'please come Saturday', recipientRelationship: 'electrician' },
      'en',
    );
    expect(draft.short).not.toContain('Hi electrician');
    expect(draft.short.startsWith('Hi')).toBe(true);
  });

  it('uses a capitalised single-word name when one is given', () => {
    const draft = draftMessageOffline(
      { context: 'please come Saturday', recipientRelationship: 'Ashok' },
      'en',
    );
    expect(draft.short).toContain('Hi Ashok');
  });
});
