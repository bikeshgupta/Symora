/**
 * Turns pipeline state into the chat response's text + UI hint
 * (.claude/rules/ai-pipeline.md: "the model phrases [results], it does not compute
 * them"). Every string here is a deterministic template over already-computed values —
 * never a second AI call, so nothing here can hallucinate a number.
 */

import type { IntentName } from '../../types/intents';
import type { ChatFieldEditor, ChatUiSchema } from '../../types/chat';
import type { ToolResult } from '../tools/registry';
import { describeCategory, type PasteCategory } from '../../domain/drafting/paste-service';
import { withHandoff } from '../../domain/drafting/handoff';

export interface ComposedResponse {
  text: string;
  ui: ChatUiSchema | null;
}

export function composeConversational(text: string): ComposedResponse {
  return { text, ui: null };
}

const CONFIRMATION_QUESTIONS: Partial<Record<IntentName, string>> = {
  create_financial_obligation: 'Add this recurring payment?',
  mark_paid: 'Mark this paid?',
  interpret_pasted_message: 'Take this action based on the pasted message?',
};

function humanizeKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Which input a field should offer if the user corrects it.
 *
 * Read off the parsed value rather than the intent's Zod schema: the schema knows the
 * declared type but not which fields this particular extraction actually filled, and a
 * confirmation card only ever shows the ones it filled. Anything the card cannot round
 * trip — an object, an array — stays text, so an edit still produces a string the tool
 * schema will validate or reject on its own terms.
 */
function editorFor(value: unknown): ChatFieldEditor {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string' && ISO_DATE.test(value)) return 'date';
  return 'text';
}

export function composeConfirmation(
  intent: IntentName,
  args: Record<string, unknown>,
  pasteCategory?: PasteCategory,
): ComposedResponse {
  const fields = Object.entries(args)
    .filter(([key]) => key !== 'confidence')
    .map(([key, value]) => ({
      key,
      label: humanizeKey(key),
      value: formatValue(value),
      editor: editorFor(value),
    }));

  // Naming what was pasted matters: the user needs to see that this proposal came from
  // someone else's text, not from something they asked for directly.
  const question = pasteCategory
    ? `That looks like ${describeCategory(pasteCategory)}. ${CONFIRMATION_QUESTIONS[intent] ?? 'Go ahead with this?'}`
    : (CONFIRMATION_QUESTIONS[intent] ?? 'Go ahead with this?');

  return {
    text: question,
    ui: { component: 'confirmation-prompt', props: { question, intent, args, fields, pasteCategory } },
  };
}

/**
 * The drafting result as a trusted UI schema. The model wrote the message text; it did
 * not choose the component or build the links — those come from the allowlist and from
 * the pure link builders in adapters/, so nothing the model emits can become markup.
 */
export function composeDraft(draft: { short: string; detailed: string }): ComposedResponse {
  const variants = withHandoff(draft);
  return {
    text: `Short: ${draft.short}\n\nDetailed: ${draft.detailed}`,
    ui: { component: 'message-draft', props: { variants } },
  };
}

export function composeToolResult(result: ToolResult): ComposedResponse {
  if (result.intent === 'draft_message' && result.data) {
    const draft = result.data as { short?: string; detailed?: string };
    if (typeof draft.short === 'string' && typeof draft.detailed === 'string') {
      return composeDraft({ short: draft.short, detailed: draft.detailed });
    }
  }
  return { text: result.summary, ui: null };
}
