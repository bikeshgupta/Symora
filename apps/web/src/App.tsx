import { useAuth } from '@/hooks/useAuth';
import { LoginPage } from '@/pages/LoginPage';
import { HomePage } from '@/pages/HomePage';

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-body-sm text-text-muted">Loading…</p>
      </main>
    );
  }

  return user ? <HomePage /> : <LoginPage />;
}
