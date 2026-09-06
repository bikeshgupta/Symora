/**
 * Intent extraction that survives the provider being unavailable.
 *
 * Symora is built to run with no AI provider at all — the rule-based parser in
 * `ai/offline/` stands in and every deterministic feature is unchanged (CLAUDE.md
 * § Current status). A provider that is *configured but failing* — no credits, a rate
 * limit, an outage, a timeout — had no such path: the error escaped `/api/chat` and
 * became a 500, which is a strictly worse experience than having configured nothing.
 * This closes that gap by falling back to the same parser.
 *
 * The fallback is reported, never silent: `degraded` tells the caller the model did not
 * answer, so the reply can say so rather than blaming the user's phrasing, and
 * `onProviderFailure` hands the real error to the caller's logger. Nothing here retries
 * — a provider that just failed is not likely to succeed on the same turn, and a retry
 * would only make the user wait longer for the same fallback.
 */

import type { AIProvider } from '../../adapters/ai-provider';
import type { MessageLanguage } from '../../types/conversation';
import type { TemporalAnchors } from '../../domain/temporal/temporal-context';
import { extractIntentOffline } from '../offline/rule-parser';
import { extractIntent, type ExtractionResult, type ExtractIntentOptions } from './intent-extraction';

export interface ResilientExtractionResult extends ExtractionResult {
  /** True when the provider failed and the rule-based parser stood in for it. */
  degraded: boolean;
}

export interface ResilientExtractionOptions extends ExtractIntentOptions {
  /**
   * Required here, unlike on the model path where it is an optional prompt addition:
   * the rule parser resolves dates arithmetically and has nothing to fall back on.
   */
  temporal: TemporalAnchors;
  /** Set when the caller already knows this text is pasted third-party content. */
  forcePaste?: boolean;
  /**
   * Called with the real provider error before falling back. The caller logs it — this
   * layer has no logger, and swallowing the cause entirely would turn a broken key or
   * an exhausted quota into an invisible drop in understanding.
   */
  onProviderFailure?: (error: unknown) => void;
}

export async function extractIntentResilient(
  aiProvider: AIProvider,
  text: string,
  language: MessageLanguage,
  options: ResilientExtractionOptions,
): Promise<ResilientExtractionResult> {
  try {
    const result = await extractIntent(aiProvider, text, language, options);
    return { ...result, degraded: false };
  } catch (error) {
    options.onProviderFailure?.(error);
    const offline = extractIntentOffline(text, language, {
      temporal: options.temporal,
      forcePaste: options.forcePaste,
    });
    return { ...offline, degraded: true };
  }
}

/**
 * What to say when the month's allowance is spent and the rule parser found nothing.
 *
 * Kept separate from DEGRADED_NO_INTENT_TEXT because the reason genuinely differs and
 * the user can act on this one: nothing is broken, the model was simply not called, and
 * the allowance resets on a date they can wait for. Saying "I couldn't reach my language
 * model" here would be false — Symora chose not to reach it.
 */
export const QUOTA_EXHAUSTED_NO_INTENT_TEXT =
  "You've used this month's AI allowance, so I read that with my simpler built-in parser " +
  "and didn't catch an action. Everything else still works exactly as before — try a more " +
  'literal phrasing like "Home loan 42500 every month on 5th" or "what\'s pending?". Your ' +
  'allowance resets at the start of next month.';

/**
 * What to say when the model was unreachable and the rule parser found nothing either.
 * The offline parser's own "I didn't catch an action" text blames the phrasing, which
 * would be a lie here — the user's sentence may have been perfectly clear.
 */
export const DEGRADED_NO_INTENT_TEXT =
  "I couldn't reach my language model just now, so I read that with my simpler built-in " +
  'parser and didn\'t catch an action. Everything else still works — try a more literal ' +
  'phrasing like "Home loan 42500 every month on 5th" or "what\'s pending?".';
