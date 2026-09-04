import { useAuth } from '@/hooks/useAuth';
import { useHome } from '@/hooks/useHome';
import { useChat } from '@/hooks/useChat';
import { useUpdateCommitment } from '@/hooks/useCommitments';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AskSymora } from '@/components/AskSymora';
import { AttentionCard, CardShell, PaymentSummary, TaskList } from '@/components/trusted';
import { CommitmentList } from '@/components/trusted/CommitmentList';
import { MemoryPanel } from '@/components/MemoryPanel';
import { PastePanel } from '@/components/PastePanel';
import { DraftPanel } from '@/components/DraftPanel';
import { FinancePanel } from '@/components/FinancePanel';
import { CommitmentsPanel } from '@/components/CommitmentsPanel';

const GREETING: Record<string, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

/**
 * The personalized home (PROGRESS.md Phase 6).
 *
 * Deliberately not a dashboard: the order is what needs you, then this month's money,
 * then today, then the input. Everything on it is computed server-side by
 * `homeService.getHome` and rendered through the trusted component set — the page
 * derives no totals and picks no urgency of its own.
 *
 * One `useChat` instance is created here and passed down, so the Ask Symora box and the
 * paste flow share a single conversation instead of starting two.
 */
export function HomePage() {
  const { signOutUser } = useAuth();
  const { data: home, isLoading, isError, error } = useHome();
  const chat = useChat();
  const updateCommitment = useUpdateCommitment();

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-display text-text-primary">
              {home
                ? `${GREETING[home.greeting.partOfDay]}${home.greeting.displayName ? `, ${home.greeting.displayName.split(' ')[0]}` : ''}`
                : 'Symora'}
            </h1>
            {home && <p className="mt-1 text-body-sm text-text-muted">{home.greeting.today}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </header>

        {isLoading && (
          <CardShell>
            <p className="text-body-sm text-text-muted">Getting your day together…</p>
          </CardShell>
        )}

        {isError && (
          <CardShell>
            <p className="text-body-sm text-overdue">
              {error instanceof Error ? error.message : "Couldn't load your home screen."}
            </p>
          </CardShell>
        )}

        {home && (
          <>
            <AttentionCard items={home.attention} />

            <PaymentSummary payments={home.payments} />

            {home.todayTasks.length > 0 && (
              <TaskList
                tasks={home.todayTasks}
                onComplete={(task) => updateCommitment.mutate({ id: task.id, status: 'done' })}
              />
            )}

            {home.upcomingImportantDates.length > 0 && (
              <CommitmentList
                title="Coming up"
                commitments={home.upcomingImportantDates}
                emptyMessage="Nothing on the calendar."
              />
            )}

            <AskSymora chat={chat} suggestions={home.suggestions} />
          </>
        )}

        {!home && !isLoading && <AskSymora chat={chat} suggestions={[]} />}

        <PastePanel chat={chat} />

        <DraftPanel />

        <CommitmentsPanel />

        <FinancePanel />

        <MemoryPanel />
      </div>
    </main>
  );
}
