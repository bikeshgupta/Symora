/**
 * The NLP regression corpus (.claude/rules/ai-pipeline.md § Language: "Maintain an NLP
 * regression corpus of real, messy phrases. Every parsing bug found in use gets added to
 * it as a test case").
 *
 * Scope, stated plainly: these assert the DETERMINISTIC halves of the pipeline —
 * language detection, ambiguity detection and the risk gate — against the acceptance
 * phrases from Phases 2 and 7. They do not assert which intent the model picks, because
 * that needs a live endpoint this suite does not have. `scripts/score-model.mjs` runs
 * the same phrases against a real one and reports what it got right.
 *
 * The rows live in `ai/corpus/nlp-corpus.json`. Add one there whenever a real phrase
 * parses wrong in use.
 */

import { describe, expect, it } from 'vitest';
import { detectLanguage } from './language';
import { decideTurn } from './confidence-risk';
import { needsRelativeDateClarification } from '../../domain/temporal/temporal-context';
import { LANGUAGE_CORPUS } from '../corpus';

describe('NLP corpus — language detection', () => {
  it('has rows to run, so a broken import cannot look like a pass', () => {
    expect(LANGUAGE_CORPUS.length).toBeGreaterThan(20);
  });

  it.each(LANGUAGE_CORPUS)('detects $language for "$text"', ({ text, language }) => {
    expect(detectLanguage(text)).toBe(language);
  });
});

describe('NLP corpus — relative-date ambiguity', () => {
  it.each(LANGUAGE_CORPUS)('$text', ({ text, needsDateClarification }) => {
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
