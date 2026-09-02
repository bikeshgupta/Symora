import { useState, type FormEvent } from 'react';
import { useChat } from '@/hooks/useChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

/**
 * Ask Symora. Functional, not the Phase 6 ConfirmationCard styling — the plain
 * confirm/cancel prompt below stands in for that trusted component until Phase 6.
 */
export function ChatPanel() {
  const { messages, pendingConfirmation, sendMessage, confirm, cancel, isSending } = useChat();
  const [draft, setDraft] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    sendMessage(text);
    setDraft('');
  }

  return (
    <Card>
      <h2 className="text-heading text-text-primary">Ask Symora</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Tell it about a payment, a task, or a reminder — in English, Hindi, or Hinglish.
      </p>

      <div className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-body-sm text-text-muted">
            Try: "Home loan 42500 every month on 5th." or "Saturday electrician ko call karna."
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-body-sm',
              message.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-surface-raised text-text-primary',
            )}
          >
            {message.content}
          </div>
        ))}
      </div>

      {pendingConfirmation && (
        <div className="mt-4 rounded-md border-2 border-primary p-4">
          <p className="text-body-sm font-medium text-text-primary">{pendingConfirmation.question}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption text-text-muted">
            {pendingConfirmation.fields.map((field) => (
              <div key={field.label} className="contents">
                <dt>{field.label}</dt>
                <dd className="text-text-primary">{field.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={confirm} disabled={isSending}>
              Confirm
            </Button>
            <Button type="button" variant="secondary" onClick={cancel} disabled={isSending}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Symora..."
          disabled={isSending}
        />
        <Button type="submit" disabled={isSending || !draft.trim()}>
          Send
        </Button>
      </form>
    </Card>
  );
}
