import { useState } from 'react';
import { LayoutList, MessageSquare } from 'lucide-react';
import { SymoraMark } from '@/components/chat/SymoraMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ChatPage } from '@/pages/ChatPage';
import { TodayPage } from '@/pages/TodayPage';
import { useChat } from '@/hooks/useChat';
import { cn } from '@/lib/cn';

const TABS = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'today', label: 'Today', icon: LayoutList },
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
 */
export function AppShell() {
  const [tab, setTab] = useState<TabId>('chat');
  const chat = useChat();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <SymoraMark size="md" />
            <span className="text-heading text-text-primary">Symora</span>
          </div>

          {/* On a wide screen the switch lives in the header; on a phone it is the bottom
              bar below, where a thumb can reach it. Only one is ever visible. */}
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

          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {tab === 'chat' ? <ChatPage chat={chat} /> : <TodayPage />}
      </main>

      <nav
        aria-label="Screens"
        className="shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <div className="flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
                tab === id ? 'text-primary' : 'text-text-muted',
              )}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="text-caption">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
