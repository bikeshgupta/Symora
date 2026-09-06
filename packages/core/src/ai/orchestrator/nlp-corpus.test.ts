/**
 * The NLP regression corpus (.claude/rules/ai-pipeline.md § Language: "Maintain an NLP
 * regression corpus of real, messy phrases. Every parsing bug found in use gets added to
 * it as a test case").
 *
 * Scope, stated plainly: these assert the DETERMINISTIC halves of the pipeline —
 * language detection, ambiguity detection and the risk gate — against the acceptance
 * phrases from Phases 2 and 7. They do not assert which intent the model picks, because
 * that needs a live provider key this suite does not have. When a live-key integration
 * test arrives (Phase 9), the same phrases are what it should run.
 *
 * Add a row here whenever a real phrase parses wrong in use.
 */

import { describe, expect, it } from 'vitest';
import { detectLanguage } from './language';
import { decideTurn } from './confidence-risk';
import { needsRelativeDateClarification } from '../../domain/temporal/temporal-context';

interface CorpusEntry {
  text: string;
  language: 'en' | 'hi' | 'hinglish';
  /** True when the phrase's relative date cannot be settled without asking. */
  needsDateClarification: boolean;
  note?: string;
}

const CORPUS: CorpusEntry[] = [
  // Phase 2 acceptance examples
  { text: 'Home loan 42500 every month on 5th.', language: 'en', needsDateClarification: false },
  { text: 'Saturday electrician ko call karna.', language: 'hinglish', needsDateClarification: false },
  { text: 'Remind me 2 days before every bill.', language: 'en', needsDateClarification: false },
  { text: 'This month what all is pending?', language: 'en', needsDateClarification: false },
  {
    text: 'Home loan kal pay kar diya.',
    language: 'hinglish',
    needsDateClarification: false,
    note: 'past tense settles "kal" as yesterday',
  },

  // Phase 7 acceptance examples
  {
    text: 'Kal wali EMI bhar diya.',
    language: 'hinglish',
    needsDateClarification: false,
    note: 'bhar diya is past tense',
  },
  {
    text: 'Saturday electrician ko call karna yaad dila dena.',
    language: 'hinglish',
    needsDateClarification: false,
  },
  { text: 'Agle 5 din me kitna payment baki hai?', language: 'hinglish', needsDateClarification: false },

  // Devanagari
  { text: 'बिजली का बिल कल भरना है', language: 'hi', needsDateClarification: false },
  { text: 'मुझे शनिवार को याद दिलाना', language: 'hi', needsDateClarification: false },

  // Plain English that must not be mistaken for Hinglish
  { text: 'What do I owe this month?', language: 'en', needsDateClarification: false },
  { text: 'Add a task to call the plumber on Friday', language: 'en', needsDateClarification: false },

  // Genuinely ambiguous: "kal" with no tense either way
  {
    text: 'kal EMI',
    language: 'hinglish',
    needsDateClarification: true,
    note: 'no tense marker — yesterday or tomorrow is a coin flip',
  },
  {
    text: 'parso appointment',
    language: 'hinglish',
    needsDateClarification: true,
    note: 'parso is two days either side',
  },

  // Phase 9 additions — messier real phrasings, mixed script and mixed tense.
  {
    text: 'maine rent de diya 15000',
    language: 'hinglish',
    needsDateClarification: false,
    note: 'no relative date at all, so nothing to settle',
  },
  {
    text: 'bijli ka bill kal bhar diya',
    language: 'hinglish',
    needsDateClarification: false,
    note: '"bhar diya" settles kal backwards',
  },
  {
    text: 'kal bijli ka bill',
    language: 'hinglish',
    needsDateClarification: true,
    note: 'the same words without a verb: nothing settles the direction',
  },
  {
    text: 'gas cylinder book karna hai parso',
    language: 'hinglish',
    needsDateClarification: false,
    note: '"karna hai" settles parso forwards',
  },
  {
    text: 'इस महीने क्या क्या pending hai?',
    language: 'hi',
    needsDateClarification: false,
    note: 'Devanagari plus Latin in one sentence still reads as Hindi',
  },
  {
    text: 'agle hafte school fees 12000 deni hai',
    language: 'hinglish',
    needsDateClarification: false,
  },
  {
    text: 'Netflix band kar dena hai',
    language: 'hinglish',
    needsDateClarification: false,
    note: 'a brand name in Latin script must not make the sentence read as English',
  },
  {
    text: 'Please transfer the deposit before Monday',
    language: 'en',
    needsDateClarification: false,
    note: 'plain English with no Hinglish markers',
  },
];

describe('NLP corpus — language detection', () => {
  it.each(CORPUS)('detects $language for "$text"', ({ text, language }) => {
    expect(detectLanguage(text)).toBe(language);
  });
});

describe('NLP corpus — relative-date ambiguity', () => {
  it.each(CORPUS)('$text', ({ text, needsDateClarification }) => {
    expect(needsRelativeDateClarification(text)).toBe(needsDateClarification);
  });
});

describe('NLP corpus — spoken amounts always confirm', () => {
  // "Kal wali EMI bhar diya" spoken aloud carries an amount once extraction resolves the
  // obligation. Speech-to-text confuses digits, so this must never write directly.
  it('confirms a spoken mark_paid carrying an amount, however confident the model was', () => {
    expect(
      decideTurn({
        confidence: 0.99,
        isHighImpact: true,
        source: 'voice',
        args: { accountName: 'home loan', amount: 42500 },
      }),
    ).toBe('confirm');
  });

  it('confirms a spoken amount even when the intent itself is low-impact', () => {
    expect(
      decideTurn({ confidence: 0.99, isHighImpact: false, source: 'voice', args: { amount: 500 } }),
    ).toBe('confirm');
  });

  it('lets a spoken reminder with no amount through without a confirmation step', () => {
    expect(
      decideTurn({
        confidence: 0.9,
        isHighImpact: false,
        source: 'voice',
        args: { title: 'electrician ko call karna' },
      }),
    ).toBe('proceed');
  });
});
