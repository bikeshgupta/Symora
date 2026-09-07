import { useEffect, useRef } from 'react';
import { CloudOff, Gauge, WifiOff } from 'lucide-react';
import { ConfirmationCard, MessageDraftCard, SuggestionChip } from '@/components/trusted';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { Composer } from '@/components/chat/Composer';
import { MessageBubble, ThinkingIndicator } from '@/components/chat/MessageBubble';
import { ApiRequestError } from '@/lib/api-client';
import type { useChat } from '@/hooks/useChat';
import { useHome } from '@/hooks/useHome';
import { useMe } from '@/hooks/useMe';

/**
 * Screen one: the conversation, and nothing else.
 *
 * Everything that used to compete with it — payment cards, panels, an inbox — is on the
 * Today screen. The reason is not tidiness: an assistant you talk to and a dashboard you
 * read want opposite things from a phone screen, and the old single page gave the input
 * about a fifth of it, below three cards.
 *
 * The transcript is anchored to the bottom rather than the top. A conversation grows
 * upward from where you type; starting it at the top left a screen of dead space between
 * the last reply and the composer, which read as something failing to load.
 */
export function ChatPage({
  chat,
  prefill,
  onFill,
}: {
  chat: ReturnType<typeof useChat>;
  /** Text a tapped suggestion — here or on Today — put in the composer, with a nonce so the same text twice still lands. */
  prefill: { text: string; nonce: number } | null;
  onFill: (text: string) => void;
}) {
  const { entries, pendingConfirmation, suggestions, draftOf, sendMessage, confirm, cancel, isSending, error } =
    chat;
  const { data: home } = useHome();
  const { data: me } = useMe();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows. `smooth` is intentional and safe: the global
  // prefers-reduced-motion rule in index.css neutralises it for users who ask.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries.length, isSending]);

  const isEmpty = entries.length === 0;
  const modelStatus = me?.capabilities.modelStatus;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div
          className={`mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6 sm:px-6 ${
            isEmpty ? 'justify-center' : 'justify-end'
          }`}
        >
          {isEmpty ? (
            <ChatEmptyState
              greeting={home?.greeting}
              me={me}
              suggestions={home?.suggestions ?? []}
              onSelect={onFill}
            />
          ) : (
            <div className="flex flex-col gap-6">
              {entries.map((entry, index) => {
                const draft = draftOf(entry);
                const isLast = index === entries.length - 1;
                const showsConfirmation = isLast && pendingConfirmation !== null;

                return (
                  <div key={entry.message.id} className="flex flex-col gap-4">
                    {/* The confirmation card's title *is* the reply — composeConfirmation
                        sends the same question as the message text so a transcript-only
                        surface still reads. Showing both says it twice. */}
                    {!(showsConfirmation && entry.message.role === 'assistant') && (
                      <MessageBubble entry={entry} />
                    )}

                    {draft && <MessageDraftCard variants={draft.variants} />}

                    {/* Only the newest proposal is actionable — an older card would
                        confirm a write the user has since moved past. */}
                    {isLast && pendingConfirmation && (
                      <ConfirmationCard
                        question={pendingConfirmation.question}
                        fields={pendingConfirmation.fields}
                        note={
                          pendingConfirmation.pasteCategory
                            ? 'This came from a message you pasted, so nothing is saved until you confirm.'
                            : undefined
                        }
                        onConfirm={confirm}
                        onCancel={cancel}
                        isBusy={isSending}
                      />
                    )}

                    {isLast && suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion) => (
                          <SuggestionChip
                            key={suggestion.id}
                            label={suggestion.label}
                            onSelect={() => onFill(suggestion.prompt)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {isSending && <ThinkingIndicator />}

              {error && <ChatError error={error} />}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {modelStatus && modelStatus !== 'ready' && (
        <ModelStatusStrip status={modelStatus} provider={me?.capabilities.modelProvider ?? 'The AI provider'} />
      )}

      <Composer
        key={prefill?.nonce ?? 'composer'}
        onSend={sendMessage}
        isSending={isSending}
        capabilities={me?.capabilities}
        initialText={prefill?.text ?? ''}
        autoFocus={Boolean(prefill)}
      />
    </div>
  );
}

/**
 * A failed turn, with the two things that make it diagnosable.
 *
 * The message is the server's own, from the one error contract. The code and request id
 * are shown underneath because they are what turns "it doesn't work" into a line in the
 * logs — they are already designed to be safe to show
 * (.claude/rules/auth-security.md § Errors and logging), unlike anything they point to.
 */
function ChatError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'That message did not go through.';
  const detail =
    error instanceof ApiRequestError && error.requestId !== 'client'
      ? `${error.code} · request ${error.requestId}`
      : error instanceof ApiRequestError
        ? error.code
        : null;

  return (
    <div className="rounded-md bg-overdue-surface px-4 py-3">
      <p className="text-body-sm text-overdue">{message}</p>
      {detail && <p className="mt-1 font-numeric text-caption text-overdue/80">{detail}</p>}
    </div>
  );
}

/**
 * Says which state the model layer is in, in the one place it changes what the user
 * should expect. The three non-ready states must not share a word (CLAUDE.md): a machine
 * to switch on, a quota that refills, and a deployment nobody configured are three
 * different next actions, and telling someone to check their configuration when they
 * have simply used today's free requests wastes an afternoon.
 */
function ModelStatusStrip({
  status,
  provider,
}: {
  status: 'offline' | 'unreachable' | 'rate_limited';
  provider: string;
}) {
  const Icon = status === 'offline' ? CloudOff : status === 'rate_limited' ? Gauge : WifiOff;

  const message =
    status === 'rate_limited'
      ? `${provider} is rate limiting Symora for the moment — it is reading your messages with its built-in parser until the quota frees up.`
      : status === 'unreachable'
        ? `${provider} is not answering — Symora is using its built-in parser meanwhile. Everything deterministic still works.`
        : 'No AI model configured — Symora is using its built-in parser. Keep requests close to the examples.';

  return (
    <div className="border-t border-border bg-surface-raised px-4 py-2 sm:px-6">
      <p className="mx-auto flex max-w-3xl items-center gap-2 text-caption text-text-muted">
        <Icon size={14} className="shrink-0" aria-hidden="true" />
        {message}
      </p>
    </div>
  );
}
