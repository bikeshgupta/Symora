import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ChatMessageView, ChatResponseBody, ChatUiSchema, IntentName } from '@symora/core';

type ConfirmationProps = Extract<ChatUiSchema, { component: 'confirmation-prompt' }>['props'];
type DraftProps = Extract<ChatUiSchema, { component: 'message-draft' }>['props'];

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
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationProps | null>(null);
  const [draft, setDraft] = useState<DraftProps | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: SendPayload) =>
      apiFetch<ChatResponseBody>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ conversationId, ...payload }),
      }),
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((prev) => [...prev, data.message]);
      setPendingConfirmation(data.ui?.component === 'confirmation-prompt' ? data.ui.props : null);
      setDraft(data.ui?.component === 'message-draft' ? data.ui.props : null);
    },
  });

  const sendMessage = useCallback(
    (text: string, source: 'chat' | 'voice' = 'chat') => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: text,
          language: null,
          intent: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setPendingConfirmation(null);
      setDraft(null);
      mutation.mutate({ text, source });
    },
    [mutation],
  );

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

  const cancel = useCallback(() => setPendingConfirmation(null), []);

  // The last thing Symora said, for surfaces that show a single reply rather than a
  // transcript (the paste panel).
  const lastAssistantText =
    [...messages].reverse().find((message) => message.role === 'assistant')?.content ?? null;

  return {
    messages,
    pendingConfirmation,
    draft,
    lastAssistantText,
    sendMessage,
    confirm,
    cancel,
    isSending: mutation.isPending,
    error: mutation.error,
  };
}
