/**
 * Message drafting (.claude/rules/ai-pipeline.md § Provider and model use: "Message
 * drafting produces both variants — short, and warm/detailed — in one call"). The only
 * V1 intent that is AI-only start to finish; nothing is persisted here (there is no
 * `drafts` table in the V1 data model — Phase 5 wires the WhatsApp/email handoff to
 * whatever the caller does with this result).
 */

import type { AIProvider } from '../../adapters/ai-provider';
import type { IntentArgs } from '../../types/intents';

export interface DraftMessageResult {
  short: string;
  detailed: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd?: number };
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    short: { type: 'string', description: 'A brief, to-the-point variant.' },
    detailed: { type: 'string', description: 'A warmer, more detailed variant.' },
  },
  required: ['short', 'detailed'],
  additionalProperties: false,
} as const;

export interface DraftMessageOptions {
  /**
   * A pre-rendered memory block (buildMemoryContext). Passed already fenced and
   * labelled as reference data rather than as raw text, because a memory holds whatever
   * the user typed and must never reach the model in instruction position
   * (.claude/rules/ai-pipeline.md § Memory in the pipeline). The caller renders it so
   * this domain service does not have to reach up into the AI layer.
   */
  memoryContext?: string | null;
}

export async function draftMessage(
  aiProvider: AIProvider,
  args: IntentArgs<'draft_message'>,
  language: 'en' | 'hi' | 'hinglish',
  options: DraftMessageOptions = {},
): Promise<DraftMessageResult> {
  const result = await aiProvider.complete({
    tier: 'cheap',
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content:
          'You draft short messages on behalf of the user, in ' +
          `${language === 'hi' ? 'Hindi' : language === 'hinglish' ? 'Hinglish (romanized Hindi mixed with English)' : 'English'}. ` +
          'Produce exactly two variants: "short" (brief, to the point) and "detailed" ' +
          '(warmer, more context). Use the stated relationship to the recipient, if given, ' +
          'to set the tone. Output nothing else — the message text only, no preamble.',
      },
      ...(options.memoryContext ? [{ role: 'system' as const, content: options.memoryContext }] : []),
      {
        role: 'user',
        content:
          `What the message needs to say: ${args.context}\n` +
          (args.recipientRelationship ? `Recipient: ${args.recipientRelationship}` : ''),
      },
    ],
    responseSchema: RESPONSE_SCHEMA,
  });

  const parsed = result.structured as { short: string; detailed: string } | null;
  if (!parsed) throw new Error('Message drafting returned no structured output.');

  return {
    short: parsed.short,
    detailed: parsed.detailed,
    model: result.model,
    usage: result.usage,
  };
}
