/**
 * One structured call combining domain classification + intent/entity extraction
 * (.claude/rules/ai-pipeline.md's flow diagram draws these as two boxes; nothing
 * mandates two separate AI calls, and one is cheaper). Uses the AIProvider's native
 * tool-calling: the model either calls exactly one registered tool, or replies in
 * plain text for anything that isn't one of the 12 V1 intents — which the system
 * prompt also uses for clarifying questions when a call is close but underspecified.
 */

import type { AIProvider, AITokenUsage } from '../../adapters/ai-provider';
import { buildToolDefinitions } from '../tools/registry';
import { INTENT_NAMES, type IntentName } from '../../types/intents';
import type { MessageLanguage } from '../../types/conversation';
import { buildMemoryContext, type MemoryContextEntry } from './memory-context';
import { renderTemporalContext, type TemporalAnchors } from '../../domain/temporal/temporal-context';

export interface ExtractionResult {
  intent: IntentName | null;
  args: Record<string, unknown> | null;
  confidence: number;
  /** Set only when intent is null — a clarifying question or a conversational reply. */
  text: string | null;
  usage: AITokenUsage;
  model: string;
}

function systemPrompt(language: MessageLanguage): string {
  const languageNote =
    language === 'hi' ? 'Hindi' : language === 'hinglish' ? 'Hinglish (romanized Hindi mixed with English)' : 'English';

  return [
    "You are Symora's request interpreter. The user's message is in " + languageNote + '.',
    'If the message clearly matches one of your available tools, call exactly one tool with the ' +
      "extracted arguments and your own honest `confidence` (0 to 1) that you understood it correctly. " +
      'Never guess a value you were not given — leave optional fields out instead.',
    'If the message pastes or quotes text from someone else (a payment confirmation, a booking, an ' +
      'appointment message) and asks what to do with it, call interpret_pasted_message with the pasted ' +
      'text verbatim.',
    'If the request is ambiguous, missing a required detail, or does not match any tool, do not call a ' +
      'tool — reply in plain text instead: ask exactly one clarifying question, or reply conversationally ' +
      'if nothing actionable was asked. Reply in the same language the user used.',
  ].join(' ');
}

export interface ExtractIntentOptions {
  /**
   * Dates computed in code for the user's timezone (domain/temporal/temporal-context.ts).
   * Without these the model has no reliable idea what "today" is, so "kal", "Saturday"
   * and "agle 5 din" become guesses — which is how a payment lands on the wrong date.
   */
  temporal?: TemporalAnchors;
  /**
   * Memories already selected as relevant to this turn (domain/memory/relevance.ts).
   * Rendered as fenced reference data, never as instructions — see memory-context.ts.
   * Passing them is what lets the model resolve "mummy" or "the usual time" instead of
   * asking again, which is Phase 3's acceptance criterion.
   */
  memories?: MemoryContextEntry[];
}

export async function extractIntent(
  aiProvider: AIProvider,
  text: string,
  language: MessageLanguage,
  options: ExtractIntentOptions = {},
): Promise<ExtractionResult> {
  const memoryContext = buildMemoryContext(options.memories ?? []);
  const temporalContext = options.temporal ? renderTemporalContext(options.temporal) : null;

  const result = await aiProvider.complete({
    tier: 'cheap',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt(language) },
      ...(temporalContext ? [{ role: 'system' as const, content: temporalContext }] : []),
      ...(memoryContext ? [{ role: 'system' as const, content: memoryContext }] : []),
      { role: 'user', content: text },
    ],
    tools: buildToolDefinitions(),
  });

  const call = result.toolCalls[0];
  const fallback: ExtractionResult = {
    intent: null,
    args: null,
    confidence: 0,
    text: result.text ?? "I'm not sure I understood that — could you rephrase?",
    usage: result.usage,
    model: result.model,
  };

  if (!call) return fallback;
  if (!INTENT_NAMES.includes(call.name as IntentName)) return fallback;

  const rawArgs =
    call.arguments && typeof call.arguments === 'object' ? (call.arguments as Record<string, unknown>) : {};
  const confidenceRaw = rawArgs.confidence;
  const confidence =
    typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0.5;

  return {
    intent: call.name as IntentName,
    args: rawArgs,
    confidence,
    text: null,
    usage: result.usage,
    model: result.model,
  };
}
