/**
 * Deterministic relevance scoring for memory retrieval
 * (.claude/rules/ai-pipeline.md § Memory in the pipeline: "Retrieval loads only
 * memories relevant to the current intent. Do not dump the user's whole memory into
 * the prompt.").
 *
 * Pure and AI-free by design. Which memories reach the prompt decides what the model
 * can act on, so that choice is made in code with a fixed, testable ranking rather than
 * by a second model call that could vary between runs.
 */

import type { IntentName } from '../../types/intents';
import type { MemoryType } from '../../types/memory';

export interface ScorableMemory {
  memoryType: MemoryType;
  key: string;
  text: string;
}

/** Retrieval happens before the intent is known, so this stays a per-type weighting. */
const TYPE_WEIGHT: Record<MemoryType, number> = {
  alias: 3,
  correction: 3,
  preference: 2,
  fact: 2,
};

/**
 * Types worth loading once an intent *is* known — used when re-retrieving for a
 * confirmed or nested extraction. Drafting leans on aliases and relationships;
 * scheduling leans on preferences (lead times, quiet hours).
 */
const INTENT_TYPE_PREFERENCE: Partial<Record<IntentName, MemoryType[]>> = {
  draft_message: ['alias', 'preference', 'fact'],
  create_reminder: ['preference', 'alias'],
  create_task: ['preference', 'alias'],
  remember_preference: ['preference', 'fact', 'alias'],
};

const STOP_WORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'for',
  'and', 'or', 'my', 'me', 'i', 'you', 'it', 'this', 'that', 'do', 'did', 'have', 'has',
  'what', 'when', 'how', 'please', 'remind', 'add', 'set',
  // Hinglish / romanized Hindi function words that carry no lookup value
  'ka', 'ki', 'ke', 'ko', 'se', 'me', 'mein', 'hai', 'hain', 'tha', 'thi', 'kar', 'karo',
  'karna', 'do', 'diya', 'kya', 'kab', 'kitna', 'kitne', 'aur',
]);

/**
 * Lowercases and splits on anything that is not a letter, digit or combining mark.
 *
 * `\p{M}` is not optional here: Devanagari matras (ि in बिजली, ी, the virama) are
 * combining marks, not letters, so a `\p{L}`-only class treats them as separators and
 * shreds बिजली into ब, ज, ल. Hindi input would silently score near zero against every
 * memory — the failure would look like "retrieval just isn't very good", not like a bug.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Score one memory against the tokens of the user's message. An alias matching by key
 * ("mummy") is the strongest signal — that is exactly the lookup aliases exist for —
 * so key matches outweigh value matches.
 */
export function scoreMemory(memory: ScorableMemory, messageTokens: string[]): number {
  if (messageTokens.length === 0) return 0;

  const keyTokens = new Set(tokenize(memory.key.replace(/_/g, ' ')));
  const valueTokens = new Set(tokenize(memory.text));

  let score = 0;
  for (const token of new Set(messageTokens)) {
    if (keyTokens.has(token)) score += 3;
    else if (valueTokens.has(token)) score += 1;
  }

  return score === 0 ? 0 : score + TYPE_WEIGHT[memory.memoryType];
}

export interface SelectRelevantParams<T extends ScorableMemory> {
  memories: T[];
  text: string;
  intent?: IntentName | null;
  limit?: number;
}

export const DEFAULT_MEMORY_LIMIT = 8;

/**
 * Pick the memories worth putting in front of the model, most relevant first.
 *
 * Ties are broken by memory type (per the intent's preference, then the global
 * weighting) and finally by key, so the same inputs always produce the same ordering —
 * an unstable sort here would make the pipeline non-reproducible.
 */
export function selectRelevantMemories<T extends ScorableMemory>({
  memories,
  text,
  intent,
  limit = DEFAULT_MEMORY_LIMIT,
}: SelectRelevantParams<T>): T[] {
  const messageTokens = tokenize(text);
  const intentTypes = (intent && INTENT_TYPE_PREFERENCE[intent]) ?? [];

  const scored = memories
    .map((memory) => {
      const base = scoreMemory(memory, messageTokens);
      const intentRank = intentTypes.indexOf(memory.memoryType);
      return { memory, score: base, intentRank };
    })
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;

    // An intent-preferred type wins; -1 (not preferred) sorts last.
    const aRank = a.intentRank === -1 ? Number.MAX_SAFE_INTEGER : a.intentRank;
    const bRank = b.intentRank === -1 ? Number.MAX_SAFE_INTEGER : b.intentRank;
    if (aRank !== bRank) return aRank - bRank;

    const typeDiff = TYPE_WEIGHT[b.memory.memoryType] - TYPE_WEIGHT[a.memory.memoryType];
    if (typeDiff !== 0) return typeDiff;

    return a.memory.key.localeCompare(b.memory.key);
  });

  return scored.slice(0, limit).map((entry) => entry.memory);
}
