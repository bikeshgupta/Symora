import { useState } from 'react';
import { SymoraMark } from '@/components/chat/SymoraMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ChatPage } from '@/pages/ChatPage';
import { TodayPage } from '@/pages/TodayPage';
import { useChat } from '@/hooks/useChat';
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe';
import { cn } from '@/lib/cn';

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'today', label: 'Today' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * The two-screen frame.
 *
 * Screen one is the conversation; screen two is everything Symora is holding. They are
 * tabs rather than routes because there is nothing to link to yet and a router would add
 * a dependency for a single decision — when deep links or a back-button history are
 * needed, this is the one place that changes.
 *
 * The conversation lives here, above both screens, so it survives switching to Today and
 * back. Losing a half-finished exchange because the user checked what they owed would be
 * the whole reason the old single page felt fragile.
 *
 * The frame itself is fixed to the viewport (`h-dvh`, no page scroll) and each screen
 * scrolls inside it. That is what lets the composer sit at the bottom of the chat screen
 * on a phone without the browser chrome pushing it off.
 *
 * On a phone the screens are swiped between rather than tabbed: a permanent bottom bar
 * spends a strip of a small screen every second of the day on a control used a few times
 * a day, and below the composer it competed with the one thing that should own the
 * bottom edge. Pointer devices keep the segmented control in the header, because a
 * trackpad has no reliable equivalent of a thumb swipe and a screen nobody can reach is
 * worse than a control nobody needs.
 */
export function AppShell() {
  const [tab, setTab] = useState<TabId>('chat');
  const chat = useChat();
  /**
   * What a tapped suggestion put in the composer. It lives here rather than in the chat
   * screen because Today taps into it too: tapping an overdue payment should open the
   * conversation with the sentence already written, not execute anything — a shortcut
   * into the pipeline can never skip a confirmation gate
   * (.claude/rules/design-system.md, SuggestionChip).
   *
   * The nonce is what makes tapping the same row twice work: the composer is remounted
   * with the text, and an identical string alone would not change its key.
   */
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);

  function ask(text: string) {
    setPrefill((prev) => ({ text, nonce: (prev?.nonce ?? 0) + 1 }));
    setTab('chat');
  }

  const swipe = useHorizontalSwipe({
    // Left moves forward through the screens, right moves back — the order they sit in
    // TABS, which is also the order the header shows them.
    onSwipeLeft: () => setTab('today'),
    onSwipeRight: () => setTab('chat'),
  });

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <SymoraMark size="md" />
            <span className="text-heading text-text-primary">Symora</span>
          </div>

          {/* Pointer devices only. A phone swipes instead — see the swipe handler on
              <main> below. */}
          <nav aria-label="Screens" className="hidden sm:flex">
            <div className="flex gap-1 rounded-full border border-border bg-surface-raised p-1">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? 'page' : undefined}
                  className={cn(
                    'min-h-[36px] rounded-full px-4 text-body-sm transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                    tab === id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>

          {/*
            The same two destinations for anyone who cannot swipe. A screen reader's own
            gestures take precedence over the page's, so a phone user on VoiceOver or
            TalkBack would otherwise have no way at all to reach Today; a keyboard user in
            a narrow window is in the same position. These are invisible until focused,
            so the screen stays as uncluttered as it looks.
          */}
          <nav aria-label="Screens" className="sm:hidden">
            {TABS.filter(({ id }) => id !== tab).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="sr-only rounded-full px-4 py-2 text-body-sm text-text-primary focus:not-sr-only focus:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Go to {label}
              </button>
            ))}
          </nav>

          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1" {...swipe}>
        {tab === 'chat' ? (
          <ChatPage chat={chat} prefill={prefill} onFill={ask} />
        ) : (
          <TodayPage onAsk={ask} />
        )}
      </main>

    </div>
  );
}
