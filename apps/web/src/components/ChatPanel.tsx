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
  const {
    messages,
    pendingConfirmation,
    draft: messageDraft,
    sendMessage,
    confirm,
    cancel,
    isSending,
  } = useChat();
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

      {messageDraft && (
        <ul className="mt-4 flex flex-col gap-3">
          {messageDraft.variants.map((variant) => (
            <li key={variant.variant} className="rounded-md border border-border bg-surface-raised p-3">
              <p className="text-caption text-text-muted">
                {variant.variant === 'short' ? 'Short' : 'Warmer'}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-body-sm text-text-primary">{variant.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={variant.handoff.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 text-body-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Open in WhatsApp
                </a>
                <a
                  href={variant.handoff.mailtoUrl}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-surface px-4 text-body-sm font-medium text-text-primary"
                >
                  Open in email
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

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
