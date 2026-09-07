/**
 * The offline half of the NLP regression corpus.
 *
 * `orchestrator/nlp-corpus.test.ts` asserts only the deterministic halves — language,
 * ambiguity, the risk gate — because it cannot know which intent a model will pick. The
 * rule parser has no such excuse: it is deterministic code, it is what a pilot user
 * without a model actually talks to, and the Phase 2 and Phase 7 acceptance phrases are
 * exactly what it has to get right. So they are asserted here, end to end, with no
 * provider and no network.
 *
 * The rows themselves live in `ai/corpus/nlp-corpus.json`, shared with the language
 * tests and with `scripts/score-model.mjs` — the same phrases that guard against
 * regressions also score a candidate model. Add a row there whenever a real phrase
 * parses wrong in use.
 */

import { describe, expect, it } from 'vitest';
import { extractIntentOffline } from './rule-parser';
import { detectLanguage } from '../orchestrator/language';
import { buildTemporalAnchors } from '../../domain/temporal/temporal-context';
import {
  CORPUS_NOW,
  CORPUS_TIMEZONE,
  MODEL_ONLY_CORPUS,
  OFFLINE_CORPUS,
} from '../corpus';

const temporal = buildTemporalAnchors(new Date(CORPUS_NOW), CORPUS_TIMEZONE);

function parse(text: string) {
  return extractIntentOffline(text, detectLanguage(text), { temporal });
}

describe('offline rule parser — acceptance corpus', () => {
  it('has rows to run, so a broken import cannot look like a pass', () => {
    expect(OFFLINE_CORPUS.length).toBeGreaterThan(20);
  });

  it.each(OFFLINE_CORPUS)('$text', ({ text, intent, args }) => {
    const result = parse(text);
    expect(result.intent).toBe(intent);
    if (args) expect(result.args).toMatchObject(args);
  });

  it('asks for a name rather than inventing one it would then show on a card', () => {
    // No obligation keyword and nothing name-like left over. A confirmation card showing
    // a name Symora made up invites the user to skim past it and save it that way.
    const result = parse('i pay 2500 every month on the 8th for something');
    expect(result.intent).toBeNull();
    expect(result.text).toContain('what should I call this payment?');
    expect(result.text).toContain('8th');
  });

  it('never invents an intent for something it does not understand', () => {
    const result = parse('what do you think about the weather lately');
    expect(result.intent).toBeNull();
    expect(result.text).toBeTruthy();
  });

  it('reports zero token usage, since nothing was billed', () => {
    expect(parse('Home loan 42500 every month on 5th.').usage.totalTokens).toBe(0);
  });
});

/**
 * Devanagari is a known limit of this parser, not a bug to be found later.
 *
 * The patterns are Latin-script, so Hindi typed in Devanagari cannot match any of them.
 * That is a Phase 7 gap recorded in PROGRESS.md, and the model path handles it. What
 * matters offline is that the limit is stated honestly instead of being reported back to
 * the user as their phrasing being unclear — they would rewrite the sentence forever.
 */
describe('offline rule parser — Devanagari input', () => {
  // Marked `offline: "unsupported"` in the corpus: a model is expected to parse these,
  // the rule parser is expected to say so honestly rather than guess.
  const DEVANAGARI_PHRASES = MODEL_ONLY_CORPUS.map((row) => row.text);

  it('has Devanagari rows to run', () => {
    expect(DEVANAGARI_PHRASES.length).toBeGreaterThan(0);
  });

  it.each(DEVANAGARI_PHRASES)('never guesses an intent from %s', (text) => {
    const result = parse(text);
    // The one outcome that would be worse than not understanding: understanding wrongly.
    expect(result.intent).toBeNull();
  });

  it.each(DEVANAGARI_PHRASES)('answers %s in Hindi, not in English', (text) => {
    const result = parse(text);
    expect(result.text).toMatch(/[\u0900-\u097F]/);
    expect(result.text).not.toMatch(/I didn't catch an action/);
  });

  it('says the limit is the parser’s script, not the user’s phrasing', () => {
    const result = parse('होम लोन 42500 हर महीने 5 तारीख को');
    expect(result.text).toContain('रोमन');
    // And points at a phrasing that actually works.
    expect(result.text).toContain('har mahine');
  });

  it('answers Hinglish in Hinglish rather than English', () => {
    const result = parse('kuch samajh nahi aaya mujhe');
    expect(result.intent).toBeNull();
    expect(result.text).toContain('har mahine');
    expect(result.text).not.toMatch(/I didn't catch an action/);
  });

  it('still answers plain English in English', () => {
    const result = parse('what do you think about the weather lately');
    expect(result.text).toMatch(/I didn't catch an action/);
  });
});
