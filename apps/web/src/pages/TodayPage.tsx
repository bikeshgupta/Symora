import { useState } from 'react';
import { CardShell } from '@/components/trusted';
import { AttentionCard, PaymentSummary, TaskList } from '@/components/trusted';
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
import { cn } from '@/lib/cn';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'money', label: 'Money' },
  { id: 'commitments', label: 'Commitments' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'you', label: 'You' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const GREETING: Record<string, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
};

/**
 * Screen two: what Symora is holding for you.
 *
 * Overview is the personalized home the requirements describe — deliberately not a
 * dashboard: what needs you, then this month's money, then today. Everything on it is
 * computed server-side by `homeService.getHome` and rendered through the trusted
 * component set; this page derives no totals and picks no urgency of its own.
 *
 * The remaining sections are the full surfaces behind it. They are sections rather than
 * one long scroll because they answer different questions on different days, and a page
 * that shows all of them at once is the "financial dashboard" the design direction
 * explicitly rejects.
 */
export function TodayPage() {
  const [section, setSection] = useState<SectionId>('overview');
  const { signOutUser } = useAuth();
  const { data: home, isLoading, isError, error } = useHome();
  const { data: me } = useMe();
  const updateCommitment = useUpdateCommitment();

  return (
    <div className="h-full overflow-y-auto">
      <nav
        aria-label="Sections"
        className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-2 sm:px-6">
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

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
        {section === 'overview' && (
          <>
            <header>
              <h1 className="text-title text-text-primary">
                {home
                  ? `${GREETING[home.greeting.partOfDay]}${home.greeting.displayName ? `, ${home.greeting.displayName.split(' ')[0]}` : ''}`
                  : 'Today'}
              </h1>
              {home && <p className="mt-1 text-body-sm text-text-muted">{home.greeting.today}</p>}
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
              <p className="mt-1 text-body-sm text-text-muted">
                {me?.email ?? 'Signed in'}
              </p>
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
