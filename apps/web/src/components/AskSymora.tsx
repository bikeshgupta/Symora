import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardShell, ConfirmationCard, MessageDraftCard, SuggestionChip } from '@/components/trusted';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import type { useChat } from '@/hooks/useChat';
import type { HomeSuggestion } from '@symora/core';
import type { RuntimeCapabilities } from '@/hooks/useMe';
import { cn } from '@/lib/cn';

/**
 * The Ask Symora input and its conversation, with push-to-talk (Phases 6 and 7).
 *
 * A transcript never sends itself. It lands in the input for the user to read and edit
 * first — speech-to-text confuses digits, and the review step is what stops a misheard
 * amount reaching the pipeline at all. Anything sent from a transcript is flagged
 * `source: 'voice'` so the server's risk gate confirms monetary amounts even when the
 * intent would otherwise proceed (.claude/rules/ai-pipeline.md).
 */
export function AskSymora({
  chat,
  suggestions,
  capabilities,
}: {
  chat: ReturnType<typeof useChat>;
  suggestions: HomeSuggestion[];
  capabilities?: RuntimeCapabilities;
}) {
  const { messages, pendingConfirmation, draft, sendMessage, confirm, cancel, isSending } = chat;
  const [text, setText] = useState('');
  // Tracks whether what is currently in the box came from the mic, so the turn can be
  // labelled honestly when it is sent.
  const [fromVoice, setFromVoice] = useState(false);

  const voice = useVoiceInput(
    (transcript) => {
      setText(transcript);
      setFromVoice(true);
    },
    { useServerTranscription: capabilities?.serverTranscription ?? false },
  );

  function submit(value: string, source: 'chat' | 'voice') {
    const trimmed = value.trim();
    if (!trimmed || isSending) return;
    sendMessage(trimmed, source);
    setText('');
    setFromVoice(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit(text, fromVoice ? 'voice' : 'chat');
  }

  return (
    <CardShell as="section" aria-labelledby="ask-heading">
      <h2 id="ask-heading" className="text-heading text-text-primary">
        Ask Symora
      </h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Tell it, type it, or hold the mic — English, Hindi or Hinglish.
      </p>

      {messages.length > 0 && (
        <div className="mt-4 flex max-h-80 flex-col gap-3 overflow-y-auto">
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
      )}

      {draft && (
        <div className="mt-4">
          <MessageDraftCard variants={draft.variants} />
        </div>
      )}

      {pendingConfirmation && (
        <div className="mt-4">
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
        </div>
      )}

      <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
        <Input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (fromVoice) setFromVoice(false);
          }}
          placeholder={voice.state === 'recording' ? 'Listening…' : 'Ask Symora…'}
          disabled={isSending || voice.state === 'transcribing'}
          aria-label="Ask Symora"
        />

        {voice.isSupported && (
          <Button
            type="button"
            variant={voice.state === 'recording' ? 'primary' : 'secondary'}
            onClick={() => (voice.state === 'recording' ? voice.stop() : void voice.start())}
            disabled={isSending || voice.state === 'transcribing'}
            aria-label={voice.state === 'recording' ? 'Stop recording' : 'Record a voice message'}
          >
            {voice.state === 'recording' ? 'Stop' : voice.state === 'transcribing' ? '…' : 'Mic'}
          </Button>
        )}

        <Button type="submit" disabled={isSending || !text.trim()}>
          Send
        </Button>
      </form>

      {voice.state === 'recording' && (
        <p className="mt-2 text-caption text-text-muted">
          Listening — press Stop when you&apos;re done. You&apos;ll see what Symora heard before
          anything happens.
          {voice.usesBrowserRecognition && ' Your browser is doing the listening, on this device.'}
        </p>
      )}
      {voice.state === 'transcribing' && (
        <p className="mt-2 text-caption text-text-muted">Working out what you said…</p>
      )}
      {voice.error && <p className="mt-2 text-caption text-overdue">{voice.error}</p>}

      {suggestions.length > 0 && messages.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <SuggestionChip
              key={suggestion.id}
              label={suggestion.label}
              onSelect={() => setText(suggestion.prompt)}
            />
          ))}
        </div>
      )}
    </CardShell>
  );
}
