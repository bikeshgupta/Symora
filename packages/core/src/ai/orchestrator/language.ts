/**
 * Language detection (.claude/rules/ai-pipeline.md § Language): "Detect first, then
 * route." A heuristic, not an AI call — detection doesn't need one, and every AI call
 * this pipeline makes should earn its cost (ai-pipeline.md § Provider and model use).
 */

import type { MessageLanguage } from '../../types/conversation';

const DEVANAGARI_RANGE = /[ऀ-ॿ]/;

// A small set of high-frequency romanized-Hindi function words that rarely appear in
// English sentences. Good enough to separate "Saturday electrician ko call karna." from
// plain English without an AI call; genuinely ambiguous cases still reach the model,
// which sees the raw text regardless of this label.
const HINGLISH_MARKERS =
  /\b(ka|ki|ke|ko|kal|hai|hain|kar|karna|karo|kiya|diya|bhar|wala|wali|nahi|nahin|abhi|kyun|kaise|kitna|kitne|paisa|paise|bhai|yaar)\b/i;

export function detectLanguage(text: string): MessageLanguage {
  if (DEVANAGARI_RANGE.test(text)) return 'hi';
  if (HINGLISH_MARKERS.test(text)) return 'hinglish';
  return 'en';
}
