import { useState } from 'react';
import { AttentionCard, CardShell, PaymentSummary, SuggestionChip, TaskList } from '@/components/trusted';
import { CommitmentList } from '@/components/trusted/CommitmentList';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ModeBanner } from '@/components/ModeBanner';
import { NotificationsPanel } from '@/components/NotificationsPanel';
import { CommitmentsPanel } from '@/components/CommitmentsPanel';
import { FinancePanel } from '@/components/FinancePanel';
import { DraftPanel } from '@/components/DraftPanel';
import { MemoryPanel } from '@/components/MemoryPanel';
import { PrivacyPanel } from '@/components/PrivacyPanel';
import { useAuth } from '@/hooks/useAuth';
import { useHome } from '@/hooks/useHome';
import { useMe } from '@/hooks/useMe';
import { useUpdateCommitment } from '@/hooks/useCommitments';
import type { AttentionItem, HomeGreeting } from '@symora/core';
import { cn } from '@/lib/cn';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'money', label: 'Money' },
  { id: 'commitments', label: 'Commitments' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'you', label: 'You' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const GREETING: Record<HomeGreeting['partOfDay'], string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

/**
 * The sentence a tapped row puts in the composer.
 *
 * A shortcut, not an action: it opens the conversation with the request already written
 * so the user reads it before sending, and it then goes through the same extraction,
 * confirmation and tool path as anything typed. Tapping "Home loan · 2 days late" must
 * never be a way to mark a payment paid without the confirmation card that
 * .claude/rules/ai-pipeline.md requires for it.
 */
function promptFor(item: AttentionItem): string {
  switch (item.kind) {
    case 'overdue_payment':
    case 'upcoming_payment':
      return `${item.title} paid`;
    case 'overdue_task':
    case 'due_today':
      return `Mark ${item.title} done`;
    case 'important_date':
      return `Draft a message about ${item.title}`;
  }
}

/**
 * Screen two: what Symora is holding for you.
 *
 * Overview is the personalized home the requirements describe — deliberately not a
 * dashboard: what needs you, then this month's money, then today. Every number on it is
 * computed server-side by `homeService.getHome` and rendered through the trusted
 * component set; this page derives no totals and picks no urgency of its own.
 *
 * The rest are the full surfaces behind it, as sections rather than one long scroll:
 * they answer different questions on different days, and showing all of them at once is
 * the "financial dashboard" the design direction explicitly rejects.
 */
export function TodayPage({ onAsk }: { onAsk: (text: string) => void }) {
  const [section, setSection] = useState<SectionId>('overview');
  const { signOutUser } = useAuth();
  const { data: home, isLoading, isError, error } = useHome();
  const { data: me } = useMe();
  const updateCommitment = useUpdateCommitment();

  const attentionCount = home?.attention.length ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <nav
        aria-label="Sections"
        className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              aria-current={section === item.id ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-body-sm transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                section === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-muted hover:bg-surface-raised hover:text-text-primary',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 pb-10 sm:px-6">
        {section === 'overview' && (
          <>
            <header className="px-1">
              {home && (
                <p className="text-caption uppercase tracking-wide text-text-muted">
                  {home.greeting.today}
                </p>
              )}
              <h1 className="mt-1 text-title text-text-primary">
                {home
                  ? `${GREETING[home.greeting.partOfDay]}${home.greeting.displayName ? `, ${home.greeting.displayName.split(' ')[0]}` : ''}`
                  : 'Today'}
              </h1>
              {home && (
                <p className="mt-1 text-body-sm text-text-muted">
                  {attentionCount === 0
                    ? 'Nothing needs you right now.'
                    : `${attentionCount} thing${attentionCount === 1 ? '' : 's'} need${attentionCount === 1 ? 's' : ''} you today.`}
                </p>
              )}
            </header>

            {me?.capabilities && <ModeBanner capabilities={me.capabilities} />}

            {isLoading && (
              <CardShell>
                <p className="text-body-sm text-text-muted">Getting your day together…</p>
              </CardShell>
            )}

            {isError && (
              <CardShell>
                <p className="text-body-sm text-overdue">
                  {error instanceof Error ? error.message : "Couldn't load your day."}
                </p>
              </CardShell>
            )}

            {home && (
              <>
                {home.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {home.suggestions.map((suggestion) => (
                      <SuggestionChip
                        key={suggestion.id}
                        label={suggestion.label}
                        onSelect={() => onAsk(suggestion.prompt)}
                      />
                    ))}
                  </div>
                )}

                {/* Each card names itself, so the order is the only grouping the screen
                    needs: what needs you, then the month's money, then today. */}
                <AttentionCard items={home.attention} onSelect={(item) => onAsk(promptFor(item))} />

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
              </>
            )}

            <NotificationsPanel />
          </>
        )}

        {section === 'money' && <FinancePanel />}

        {section === 'commitments' && <CommitmentsPanel />}

        {section === 'drafts' && <DraftPanel />}

        {section === 'you' && (
          <>
            <MemoryPanel />
            <PrivacyPanel />
            <CardShell as="section" aria-labelledby="appearance-heading">
              <h2 id="appearance-heading" className="text-heading text-text-primary">
                Appearance and account
              </h2>
              <p className="mt-1 text-body-sm text-text-muted">{me?.email ?? 'Signed in'}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ThemeToggle />
                <Button variant="secondary" onClick={() => void signOutUser()}>
                  Sign out
                </Button>
              </div>
            </CardShell>
          </>
        )}
      </div>
    </div>
  );
}
