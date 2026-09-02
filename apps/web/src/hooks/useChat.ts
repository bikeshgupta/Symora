import { useCallback, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ChatMessageView, ChatResponseBody, ChatUiSchema, IntentName } from '@symora/core';

interface SendPayload {
  text: string;
  confirm?: { intent: IntentName; args: unknown };
}

export function useChat() {
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<ChatUiSchema['props'] | null>(null);

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
    },
  });

  const sendMessage = useCallback(
    (text: string) => {
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
      mutation.mutate({ text });
    },
    [mutation],
  );

  const confirm = useCallback(() => {
    if (!pendingConfirmation) return;
    mutation.mutate({
      text: 'Yes, go ahead.',
      confirm: { intent: pendingConfirmation.intent, args: pendingConfirmation.args },
    });
  }, [mutation, pendingConfirmation]);

  const cancel = useCallback(() => setPendingConfirmation(null), []);

  return {
    messages,
    pendingConfirmation,
    sendMessage,
    confirm,
    cancel,
    isSending: mutation.isPending,
    error: mutation.error,
  };
}
