import { SymoraMark } from './SymoraMark';
import type { ChatEntry } from '@/hooks/useChat';

/**
 * One turn.
 *
 * The two roles are shaped differently on purpose. What the user said is a bubble — it
 * is a quotable thing they typed, and seeing it back confirms what was actually sent,
 * including a transcript they may have edited. What Symora says is plain text under its
 * mark, because replies are often several lines and a long bubble reads as a wall.
 *
 * Content is rendered as text, never as markup: it is composed server-side from
 * deterministic templates, and passing any of it through a markdown or HTML renderer
 * would be exactly the hole .claude/rules/auth-security.md § Output safety closes.
 */
export function MessageBubble({ entry }: { entry: ChatEntry }) {
  const { message } = entry;

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-br-sm bg-primary px-4 py-2.5 text-body text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <SymoraMark size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-body text-text-primary">
        {message.content}
      </div>
    </div>
  );
}

/** The pause between sending and the reply, so the screen is never silently still. */
export function ThinkingIndicator() {
  return (
    <div className="flex gap-3" aria-live="polite">
      <SymoraMark size="sm" className="mt-0.5" />
      <div className="flex items-center gap-1.5 py-2">
        <span className="sr-only">Symora is thinking</span>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted"
            style={{ animationDelay: `${index * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
