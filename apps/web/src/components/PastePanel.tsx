import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmationCard } from '@/components/trusted';
import type { useChat } from '@/hooks/useChat';

/**
 * Paste-to-Symora (PROGRESS.md Phase 5). The user pastes something someone else sent —
 * a payment confirmation, a booking, an appointment, a renewal notice — and Symora
 * interprets it and proposes an action.
 *
 * It routes through the same /api/chat pipeline as everything else, so the proposal
 * always comes back as a confirmation the user has to accept: pasted third-party content
 * is high-impact by definition (.claude/rules/ai-pipeline.md), regardless of how
 * confident the interpretation was.
 *
 * It shares the page's single `useChat` instance rather than creating one: a paste and
 * the follow-up question about it belong to the same conversation.
 */
export function PastePanel({ chat }: { chat: ReturnType<typeof useChat> }) {
  const { pendingConfirmation, sendMessage, confirm, cancel, isSending, lastAssistantText } = chat;
  const [text, setText] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    sendMessage(`I was sent this — what should I do with it?\n\n${trimmed}`);
    setText('');
  }

  return (
    <Card>
      <h2 className="text-heading text-text-primary">Paste something</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        A payment message, a booking, an appointment, a renewal notice. Symora reads it and
        suggests what to do — nothing is saved until you confirm.
      </p>

      <form className="mt-4" onSubmit={handleSubmit}>
        <label htmlFor="paste-text" className="text-caption text-text-muted">
          Paste the message
        </label>
        <textarea
          id="paste-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="Rs 42,500 debited from your account towards Home Loan EMI on 05-Sep."
          className="mt-1 w-full rounded-md border border-border bg-surface p-3 text-body-sm text-text-primary placeholder:text-text-muted"
        />
        <Button type="submit" className="mt-2" disabled={isSending || !text.trim()}>
          {isSending ? 'Reading…' : 'Interpret this'}
        </Button>
      </form>

      {!pendingConfirmation && lastAssistantText && (
        <p className="mt-3 whitespace-pre-wrap text-body-sm text-text-primary">{lastAssistantText}</p>
      )}

      {pendingConfirmation && (
        <div className="mt-4">
          <ConfirmationCard
            question={pendingConfirmation.question}
            fields={pendingConfirmation.fields}
            note="This came from a message you pasted, so nothing is saved until you confirm."
            confirmLabel="Yes, do that"
            cancelLabel="No, ignore it"
            onConfirm={confirm}
            onCancel={cancel}
            isBusy={isSending}
          />
        </div>
      )}
    </Card>
  );
}
