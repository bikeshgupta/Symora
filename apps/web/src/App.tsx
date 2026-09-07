import { useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/LoginPage';
import { AppShell } from '@/components/layout/AppShell';

export function App() {
  const { user, loading, initError } = useAuth();

  if (initError) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-sm rounded-lg border border-overdue bg-overdue-surface p-5 text-body-sm text-text-primary">
          <p className="font-medium text-overdue">Symora can't start.</p>
          <p className="mt-1">{initError}</p>
          <p className="mt-2 text-text-muted">
            Check the <code>VITE_FIREBASE_*</code> values in your <code>.env</code> against your
            Firebase project settings.
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-body-sm text-text-muted">Loading…</p>
      </main>
    );
  }

  return user ? <AppShell /> : <LoginPage />;
}
