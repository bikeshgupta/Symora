/**
 * Guards the corpus data itself.
 *
 * Three things read `nlp-corpus.json` — the offline parser tests, the language tests and
 * `scripts/score-model.mjs`. A malformed row would quietly weaken all three rather than
 * fail any of them: a missing `intent` silently drops a phrase from the model scorecard,
 * and a typo'd intent name scores a model against something that does not exist.
 */

import { describe, expect, it } from 'vitest';
import {
  CORPUS_NOW,
  CORPUS_TIMEZONE,
  LANGUAGE_CORPUS,
  MODEL_ONLY_CORPUS,
  NLP_CORPUS,
  OFFLINE_CORPUS,
  PARSE_CORPUS,
} from './index';
import { INTENT_NAMES } from '../../types/intents';

describe('the NLP corpus', () => {
  it('has enough rows to be worth calling a corpus', () => {
    expect(NLP_CORPUS.length).toBeGreaterThanOrEqual(40);
  });

  it('has no duplicate phrases', () => {
    const texts = NLP_CORPUS.map((row) => row.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('gives every row a language and an ambiguity verdict', () => {
    // The scorecard breaks its results down by language; a row without one lands in an
    // "unknown" bucket that tells nobody anything.
    for (const row of NLP_CORPUS) {
      expect(row.language, `${row.text} has no language`).toBeDefined();
      expect(typeof row.needsDateClarification, `${row.text} has no ambiguity verdict`).toBe(
        'boolean',
      );
    }
  });

  it('only names intents that exist in the registry', () => {
    for (const row of PARSE_CORPUS) {
      expect(INTENT_NAMES, `${row.text} names an unknown intent`).toContain(row.intent);
    }
  });

  it('marks every row as expected, unsupported or n/a', () => {
    for (const row of NLP_CORPUS) {
      expect(['expected', 'unsupported', 'n/a'], `${row.text}`).toContain(row.offline);
    }
  });

  it('gives every row with a parse expectation an offline verdict, and vice versa', () => {
    for (const row of NLP_CORPUS) {
      if (row.intent === undefined) {
        expect(row.offline, `${row.text} has no intent but claims an offline verdict`).toBe('n/a');
      } else {
        expect(row.offline, `${row.text} has an intent but no offline verdict`).not.toBe('n/a');
      }
    }
  });

  it('covers all three languages, in both scripts', () => {
    const languages = new Set(NLP_CORPUS.map((row) => row.language));
    expect(languages).toEqual(new Set(['en', 'hi', 'hinglish']));
    expect(NLP_CORPUS.some((row) => /[ऀ-ॿ]/.test(row.text))).toBe(true);
  });

  it('exercises most of the twelve V1 intents', () => {
    const covered = new Set(PARSE_CORPUS.map((row) => row.intent));
    expect(covered.size).toBeGreaterThanOrEqual(8);
  });

  it('splits into the three views without losing or double-counting a row', () => {
    expect(OFFLINE_CORPUS.length + MODEL_ONLY_CORPUS.length).toBe(PARSE_CORPUS.length);
    expect(LANGUAGE_CORPUS.length).toBe(NLP_CORPUS.length);
  });

  it('keeps at least one phrase only a model can reach', () => {
    // If this ever empties, either Devanagari became supported offline — in which case
    // the rows move to `expected` — or somebody deleted the honest record of a gap.
    expect(MODEL_ONLY_CORPUS.length).toBeGreaterThan(0);
  });

  it('pins the instant every date expectation is relative to', () => {
    // "kal", "parso" and "Saturday" resolve against this; a change here silently
    // invalidates every dueDate in the file.
    expect(CORPUS_NOW).toBe('2026-09-05T09:00:00+05:30');
    expect(CORPUS_TIMEZONE).toBe('Asia/Kolkata');
  });

  it('uses ISO dates in every date argument', () => {
    for (const row of PARSE_CORPUS) {
      for (const [key, value] of Object.entries(row.args ?? {})) {
        if (!/date/i.test(key) || typeof value !== 'string') continue;
        expect(value, `${row.text} → ${key}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
