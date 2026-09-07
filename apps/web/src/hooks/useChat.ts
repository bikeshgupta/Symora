import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type {
  ChatMessageView,
  ChatResponseBody,
  ChatUiSchema,
  IntentName,
} from '@symora/core';

type ConfirmationProps = Extract<ChatUiSchema, { component: 'confirmation-prompt' }>['props'];
type DraftProps = Extract<ChatUiSchema, { component: 'message-draft' }>['props'];
type SuggestionProps = Extract<ChatUiSchema, { component: 'suggestion-chips' }>['props'];

/**
 * One turn in the transcript, with whatever trusted component the server attached to it.
 *
 * The UI schema is kept per turn rather than as one "latest" slot, because the chat
 * screen renders a conversation: a draft written three turns ago should still be on
 * screen where it was written. What stays single is *actionability* — only the last
 * turn's confirmation can be confirmed (see `pendingConfirmation`), so an older card can
 * never be tapped into a write the user has since moved past.
 */
export interface ChatEntry {
  message: ChatMessageView;
  ui: ChatUiSchema | null;
}

interface SendPayload {
  text: string;
  /**
   * Where the turn came from. It only ever widens the server's confirmation gate — a
   * voice turn carrying an amount always confirms — so this can make Symora more
   * careful, never less.
   */
  source?: 'chat' | 'voice';
  confirm?: { intent: IntentName; args: unknown };
}

export function useChat() {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<ChatEntry[]>([]);

  const mutation = useMutation({
    mutationFn: (payload: SendPayload) =>
      apiFetch<ChatResponseBody>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ conversationId, ...payload }),
      }),
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setEntries((prev) => [...prev, { message: data.message, ui: data.ui }]);
    },
  });

  const sendMessage = useCallback(
    (text: string, source: 'chat' | 'voice' = 'chat') => {
      setEntries((prev) => [
        ...prev,
        {
          message: {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            language: null,
            intent: null,
            createdAt: new Date().toISOString(),
          },
          ui: null,
        },
      ]);
      mutation.mutate({ text, source });
    },
    [mutation],
  );

  const lastEntry = entries.at(-1);
  const lastUi = lastEntry?.ui ?? null;
  const pendingConfirmation: ConfirmationProps | null =
    lastUi?.component === 'confirmation-prompt' ? lastUi.props : null;
  const suggestions: SuggestionProps['suggestions'] =
    lastUi?.component === 'suggestion-chips' ? lastUi.props.suggestions : [];

  /**
   * Confirms the pending proposal, optionally with corrections the user made on the card.
   *
   * Edits arrive as strings, because that is what an input produces. They are cast back
   * to the shape the field was parsed as — a due day stays a number, a date stays an ISO
   * string — so the tool schema sees the same types it would have from extraction. A cast
   * that fails is left as the raw string rather than becoming `NaN`: the server's Zod
   * validation should reject it and say so, which is far better than silently writing a
   * number nobody typed.
   *
   * Only the edited keys are overwritten. Everything else, `confidence` included, is the
   * originally parsed value, so a correction to one field cannot disturb another.
   */
  const confirm = useCallback(
    (edits: Record<string, string> = {}) => {
      if (!pendingConfirmation) return;

      const args = { ...(pendingConfirmation.args as Record<string, unknown>) };
      for (const [key, raw] of Object.entries(edits)) {
        const editor = pendingConfirmation.fields.find((field) => field.key === key)?.editor;
        if (editor === 'number') {
          const parsed = Number(raw);
          args[key] = Number.isFinite(parsed) ? parsed : raw;
        } else {
          args[key] = raw;
        }
      }

      mutation.mutate({
        text: Object.keys(edits).length > 0 ? 'Yes, with those corrections.' : 'Yes, go ahead.',
        confirm: { intent: pendingConfirmation.intent, args },
      });
    },
    [mutation, pendingConfirmation],
  );

  /**
   * Declining a proposal drops the card rather than silently leaving it on screen. The
   * turn itself stays in the transcript — the user asked something, and the record of
   * what Symora proposed should not vanish with the card.
   */
  const cancel = useCallback(() => {
    setEntries((prev) =>
      prev.map((entry, index) =>
        index === prev.length - 1 && entry.ui?.component === 'confirmation-prompt'
          ? { ...entry, ui: null }
          : entry,
      ),
    );
  }, []);

  function draftOf(entry: ChatEntry): DraftProps | null {
    return entry.ui?.component === 'message-draft' ? entry.ui.props : null;
  }

  return {
    entries,
    pendingConfirmation,
    suggestions,
    draftOf,
    sendMessage,
    confirm,
    cancel,
    isSending: mutation.isPending,
    error: mutation.error,
  };
}
