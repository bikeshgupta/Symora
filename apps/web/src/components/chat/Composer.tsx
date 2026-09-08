import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Mic, Square, X } from 'lucide-react';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import type { RuntimeCapabilities } from '@/hooks/useMe';
import { cn } from '@/lib/cn';

/**
 * Anything pasted in one go that is longer than this is treated as something the user
 * was *sent* rather than something they wrote. It is a deliberate line: a phone number
 * or an amount is a few characters, while a bank SMS, a booking confirmation or a
 * landlord's message is not.
 */
const PASTED_MESSAGE_LENGTH = 180;

/** How the composer frames a pasted message so the pipeline reads it as third-party text. */
const PASTE_PREFIX = 'I was sent this — what should I do with it?';

/**
 * The one input surface: type, paste, or hold the mic.
 *
 * Paste-to-Symora used to be its own panel on the home screen, which meant the reply
 * arrived somewhere other than where the user was looking. It is a message like any
 * other, so it belongs here — the composer notices a long paste, says so in a chip the
 * user can dismiss, and prefixes the turn accordingly. Nothing is saved either way until
 * the confirmation card comes back: pasted third-party content is high-impact by
 * definition (.claude/rules/ai-pipeline.md).
 *
 * A voice transcript never sends itself. It lands in the box for the user to read and
 * edit first — speech-to-text confuses digits — and anything sent from a transcript is
 * flagged `source: 'voice'` so the server confirms monetary amounts even when the intent
 * would otherwise proceed.
 */
export function Composer({
  onSend,
  isSending,
  capabilities,
  initialText = '',
  autoFocus = false,
}: {
  onSend: (text: string, source: 'chat' | 'voice') => void;
  isSending: boolean;
  capabilities?: RuntimeCapabilities;
  /** What a tapped suggestion put in the box. Filled, never sent — the user reads it first. */
  initialText?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initialText);
  // Whether what is in the box came from the mic, so the turn can be labelled honestly.
  const [fromVoice, setFromVoice] = useState(false);
  const [fromPaste, setFromPaste] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const voice = useVoiceInput(
    (transcript) => {
      setText(transcript);
      setFromVoice(true);
      textareaRef.current?.focus();
    },
    { useServerTranscription: capabilities?.serverTranscription ?? false },
  );

  // Grow with the text, up to a ceiling — past that the box scrolls rather than eating
  // the conversation above it.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    onSend(fromPaste ? `${PASTE_PREFIX}\n\n${trimmed}` : trimmed, fromVoice ? 'voice' : 'chat');
    setText('');
    setFromVoice(false);
    setFromPaste(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter starts a line. IME composition must never be interrupted:
    // Devanagari input on a phone commits with Enter, and sending there would post a
    // half-typed word.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData('text');
    if (pasted.trim().length >= PASTED_MESSAGE_LENGTH) setFromPaste(true);
  }

  const busy = isSending || voice.state === 'transcribing';

  return (
    <div className="border-t border-border bg-background/90 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 sm:px-6">
        {fromPaste && (
          <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised py-1 pl-3 pr-1 text-caption text-text-muted">
            Reading this as something you were sent
            <button
              type="button"
              onClick={() => setFromPaste(false)}
              aria-label="Treat this as my own words instead"
              className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text-primary"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-sm focus-within:border-primary"
        >
          <label htmlFor="composer" className="sr-only">
            Message Symora
          </label>
          <textarea
            id="composer"
            ref={textareaRef}
            rows={1}
            value={text}
            autoFocus={autoFocus}
            enterKeyHint="send"
            onChange={(event) => {
              setText(event.target.value);
              if (fromVoice) setFromVoice(false);
              if (!event.target.value.trim()) setFromPaste(false);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={voice.state === 'transcribing'}
            placeholder={voice.state === 'recording' ? 'Listening…' : 'Message Symora…'}
            className={cn(
              // The height ceiling is applied in the effect above, in pixels.
              'flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-body text-text-primary',
              'placeholder:text-text-muted focus-visible:outline-none disabled:opacity-50',
            )}
          />

          {voice.isSupported && (
            <button
              type="button"
              onClick={() => (voice.state === 'recording' ? voice.stop() : void voice.start())}
              disabled={busy && voice.state !== 'recording'}
              aria-label={voice.state === 'recording' ? 'Stop recording' : 'Record a voice message'}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                voice.state === 'recording'
                  ? 'bg-overdue-surface text-overdue'
                  : 'text-text-muted hover:bg-surface-raised hover:text-text-primary',
                'disabled:opacity-50',
              )}
            >
              {voice.state === 'recording' ? <Square size={18} /> : <Mic size={18} />}
            </button>
          )}

          <button
            type="submit"
            disabled={busy || !text.trim()}
            aria-label="Send"
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground',
              'transition-colors hover:bg-primary-hover disabled:opacity-40',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            )}
          >
            <ArrowUp size={18} />
          </button>
        </form>

        {/*
          Only speaks when it has something to say. The standing "nothing is saved until
          you confirm" line was true and, printed under every screen forever, invisible —
          a permanent strip of a phone screen spent on a sentence nobody read after the
          first day. The promise itself is not weakened by removing it: it is kept by the
          ConfirmationCard, which appears at the moment something is about to be written
          and cannot be skipped.
        */}
        {(voice.state === 'recording' || voice.state === 'transcribing' || voice.error) && (
          <p
            className={cn(
              'mt-1.5 text-center text-caption',
              voice.error && voice.state === 'idle' ? 'text-overdue' : 'text-text-muted',
            )}
            aria-live="polite"
          >
            {voice.state === 'recording'
              ? "Listening — press stop when you're done."
              : voice.state === 'transcribing'
                ? 'Working out what you said…'
                : voice.error}
          </p>
        )}
      </div>
    </div>
  );
}
