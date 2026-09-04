import { useAuth } from '@/hooks/useAuth';
import { useMe } from '@/hooks/useMe';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ChatPanel } from '@/components/ChatPanel';
import { MemoryPanel } from '@/components/MemoryPanel';
import { CommitmentsPanel } from '@/components/CommitmentsPanel';
import { FinancePanel } from '@/components/FinancePanel';
import { PastePanel } from '@/components/PastePanel';
import { DraftPanel } from '@/components/DraftPanel';

export function HomePage() {
  const { signOutUser } = useAuth();
  const { data: me, isLoading, isError, error } = useMe();

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-title text-text-primary">Symora</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => void signOutUser()}>
              Sign out
            </Button>
          </div>
        </header>

        <Card>
          <h2 className="text-heading text-text-primary">Verified session</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            This card is populated by <code>GET /api/me</code>, which only returns data
            after your Firebase ID token is verified server-side.
          </p>

          {isLoading && <p className="mt-4 text-body-sm text-text-muted">Loading…</p>}

          {isError && (
            <p className="mt-4 text-body-sm text-overdue">
              {error instanceof Error ? error.message : 'Could not load your profile.'}
            </p>
          )}

          {me && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body-sm">
              <dt className="text-text-muted">User id</dt>
              <dd className="text-text-primary">{me.id}</dd>
              <dt className="text-text-muted">Email</dt>
              <dd className="text-text-primary">{me.email ?? '—'}</dd>
              <dt className="text-text-muted">Timezone</dt>
              <dd className="text-text-primary">{me.timezone}</dd>
              <dt className="text-text-muted">Preferred language</dt>
              <dd className="text-text-primary">{me.preferredLanguage}</dd>
            </dl>
          )}
        </Card>

        <ChatPanel />

        <CommitmentsPanel />

        <FinancePanel />

        <PastePanel />

        <DraftPanel />

        <MemoryPanel />
      </div>
    </main>
  );
}
