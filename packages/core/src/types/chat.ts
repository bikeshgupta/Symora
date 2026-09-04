import type { IntentName } from './intents';
import type { PasteCategory } from '../domain/drafting/paste-service';

/**
 * The response's UI hint. Typed against the eventual Phase 6 trusted-component
 * allowlist (.claude/rules/design-system.md), but Phase 2 only ever produces
 * `confirmation-prompt` — a functional, unstyled stand-in for the real
 * `ConfirmationCard`. Never an arbitrary component name or markup
 * (.claude/rules/auth-security.md § Output safety).
 */
export type ChatUiSchema =
  | {
      component: 'confirmation-prompt';
      props: {
        question: string;
        intent: IntentName;
        args: unknown;
        fields: { label: string; value: string }[];
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
