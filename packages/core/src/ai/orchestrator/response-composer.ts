/**
 * Turns pipeline state into the chat response's text + UI hint
 * (.claude/rules/ai-pipeline.md: "the model phrases [results], it does not compute
 * them"). Every string here is a deterministic template over already-computed values —
 * never a second AI call, so nothing here can hallucinate a number.
 */

import type { IntentName } from '../../types/intents';
import type { ChatUiSchema } from '../../types/chat';
import type { ToolResult } from '../tools/registry';

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

export function composeConfirmation(intent: IntentName, args: Record<string, unknown>): ComposedResponse {
  const fields = Object.entries(args)
    .filter(([key]) => key !== 'confidence')
    .map(([key, value]) => ({ label: humanizeKey(key), value: formatValue(value) }));

  const question = CONFIRMATION_QUESTIONS[intent] ?? 'Go ahead with this?';

  return {
    text: question,
    ui: { component: 'confirmation-prompt', props: { question, intent, args, fields } },
  };
}

export function composeToolResult(result: ToolResult): ComposedResponse {
  return { text: result.summary, ui: null };
}
