/**
 * The NLP regression corpus (.claude/rules/ai-pipeline.md § Language: "Maintain an NLP
 * regression corpus of real, messy phrases. Every parsing bug found in use gets added to
 * it as a test case").
 *
 * The rows live in `nlp-corpus.json` rather than inline in a test, because three
 * different things need them and only one of them is a test:
 *
 * - `ai/offline/offline-corpus.test.ts` — does the rule-based parser get this right?
 * - `ai/orchestrator/nlp-corpus.test.ts` — language detection and date ambiguity
 * - `scripts/score-model.mjs` — does a candidate *model* get this right?
 *
 * That last one is why the file is JSON: choosing a model to self-host is otherwise a
 * guess, and this turns it into a number. Point the scorecard at any OpenAI-compatible
 * endpoint and it reports what fraction of real Hinglish phrases the model actually
 * parses — before you spend anything on hardware.
 *
 * Add a row whenever a real phrase parses wrong in use.
 */

import rows from './nlp-corpus.json';
import type { IntentName } from '../../types/intents';
import type { MessageLanguage } from '../../types/conversation';

/** Whether the rule-based parser is expected to handle a row. */
export type OfflineExpectation =
  /** The rule parser should produce this intent and these args. */
  | 'expected'
  /**
   * Only a model can reach this. Devanagari is the case that exists today: the offline
   * parser's patterns are Latin-script and `\b` word boundaries do not apply to
   * Devanagari, so it cannot match at all. The offline test asserts it produces *no*
   * intent rather than a wrong one; the scorecard still expects the model to get it.
   */
  | 'unsupported'
  /** No parse expectation recorded — the row only exercises language or ambiguity. */
  | 'n/a';

export interface CorpusRow {
  text: string;
  language?: MessageLanguage;
  /** True when the phrase's relative date cannot be settled without asking. */
  needsDateClarification?: boolean;
  intent?: IntentName;
  /** Args that must be present and exact. Others are allowed alongside. */
  args?: Record<string, unknown>;
  offline: OfflineExpectation;
  note?: string;
}

export const NLP_CORPUS: CorpusRow[] = rows as CorpusRow[];

/** Rows the rule-based parser is expected to get right. */
export const OFFLINE_CORPUS: CorpusRow[] = NLP_CORPUS.filter((row) => row.offline === 'expected');

/** Rows only a model can reach — asserted to produce no *wrong* answer offline. */
export const MODEL_ONLY_CORPUS: CorpusRow[] = NLP_CORPUS.filter(
  (row) => row.offline === 'unsupported',
);

/** Rows carrying a language expectation. */
export const LANGUAGE_CORPUS: CorpusRow[] = NLP_CORPUS.filter((row) => row.language !== undefined);

/** Every row with a parse expectation, which is what a model is scored against. */
export const PARSE_CORPUS: CorpusRow[] = NLP_CORPUS.filter((row) => row.intent !== undefined);

/**
 * The instant every date assertion in the corpus is relative to: Saturday 2026-09-05,
 * 09:00 in Asia/Kolkata. Fixed so "kal", "parso" and "Saturday" resolve to the same
 * dates on every run.
 */
export const CORPUS_NOW = '2026-09-05T09:00:00+05:30';
export const CORPUS_TIMEZONE = 'Asia/Kolkata';
