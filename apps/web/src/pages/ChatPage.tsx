import { useEffect, useRef, useState } from 'react';
import { ConfirmationCard, MessageDraftCard, SuggestionChip } from '@/components/trusted';
import { ChatEmptyState } from '@/components/chat/ChatEmptyState';
import { Composer } from '@/components/chat/Composer';
import { MessageBubble, ThinkingIndicator } from '@/components/chat/MessageBubble';
import type { useChat } from '@/hooks/useChat';
import { useHome } from '@/hooks/useHome';
import { useMe } from '@/hooks/useMe';

/**
 * Screen one: the conversation, and nothing else.
 *
 * Everything that used to compete with it — payment cards, panels, an inbox — moved to
 * the Today screen. The reason is not tidiness: an assistant you talk to and a dashboard
 * you read want opposite things from a phone screen, and the old single page gave the
 * input about a fifth of it, below three cards. Here the transcript owns the screen and
 * the composer is always within thumb reach.
 */
export function ChatPage({ chat }: { chat: ReturnType<typeof useChat> }) {
  const { entries, pendingConfirmation, suggestions, draftOf, sendMessage, confirm, cancel, isSending, error } =
    chat;
  const { data: home } = useHome();
  const { data: me } = useMe();
  // A tapped card or chip fills the composer rather than sending. The nonce is what
  // makes tapping the *same* chip twice work: the composer is remounted with the text,
  // and an identical string alone would not change its key.
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const fill = (text: string) => setPrefill((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
  const bottomRef = useRef<HTMLDivElement>(null);

  // Follow the conversation as it grows. `smooth` is intentional and safe: the global
  // prefers-reduced-motion rule in index.css neutralises it for users who ask.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [entries.length, isSending]);

  const isEmpty = entries.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          {isEmpty ? (
            <ChatEmptyState
              greeting={home?.greeting}
              me={me}
              suggestions={home?.suggestions ?? []}
              onSelect={fill}
            />
          ) : (
            <div className="flex flex-col gap-6">
              {entries.map((entry, index) => {
                const draft = draftOf(entry);
                const isLast = index === entries.length - 1;

                return (
                  <div key={entry.message.id} className="flex flex-col gap-4">
                    <MessageBubble entry={entry} />

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
                            onSelect={() => fill(suggestion.prompt)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {isSending && <ThinkingIndicator />}

              {error && (
                <p className="rounded-md bg-overdue-surface px-4 py-3 text-body-sm text-overdue">
                  {error instanceof Error ? error.message : 'That message did not go through.'}
                </p>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        key={prefill?.nonce ?? 'composer'}
        onSend={(text, source) => {
          setPrefill(null);
          sendMessage(text, source);
        }}
        isSending={isSending}
        capabilities={me?.capabilities}
        initialText={prefill?.text ?? ''}
        autoFocus={Boolean(prefill)}
      />
    </div>
  );
}
