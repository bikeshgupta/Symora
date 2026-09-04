import type { IntentName } from './intents';
import type { PasteCategory } from '../domain/drafting/paste-service';

/**
 * The response's UI hint. Typed against the eventual Phase 6 trusted-component
 * allowlist (.claude/rules/design-system.md), but Phase 2 only ever produces
 * `confirmation-prompt` — a functional, unstyled stand-in for the real
 * `ConfirmationCard`. Never an arbitrary component name or markup
 * (.claude/rules/auth-security.md § Output safety).
 */
/**
 * How a confirmation field may be corrected before the user approves it.
 *
 * An allowlist, exactly like the component names around it: the server says which of
 * three input kinds to render, and the client maps that to a real input. It never
 * carries an input type string straight through to the DOM.
 */
export type ChatFieldEditor = 'text' | 'number' | 'date';

/**
 * One parsed value on a confirmation card.
 *
 * `key` is the argument this field came from, and is what lets the user's correction be
 * written back into the tool call. `value` stays the formatted display string — the card
 * shows what was parsed, whether or not anyone edits it.
 */
export interface ChatConfirmationField {
  key: string;
  label: string;
  value: string;
  editor: ChatFieldEditor;
}

export type ChatUiSchema =
  | {
      component: 'confirmation-prompt';
      props: {
        question: string;
        intent: IntentName;
        args: unknown;
        fields: ChatConfirmationField[];
        /** Set when the proposal came from pasted third-party text. */
        pasteCategory?: PasteCategory;
      };
    }
  | {
      component: 'message-draft';
      props: {
        variants: { variant: 'short' | 'detailed'; text: string; handoff: { whatsappUrl: string; mailtoUrl: string } }[];
      };
    };

export interface ChatMessageView {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  language: 'en' | 'hi' | 'hinglish' | null;
  intent: IntentName | null;
  createdAt: string;
}

export interface ChatRequestBody {
  conversationId?: string;
  text: string;
  /** Re-posted to execute a previously returned confirmation, skipping re-extraction. */
  confirm?: {
    intent: IntentName;
    args: unknown;
  };
}

export interface ChatResponseBody {
  conversationId: string;
  message: ChatMessageView;
  ui: ChatUiSchema | null;
}
