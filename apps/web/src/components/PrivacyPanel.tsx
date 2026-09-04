import { useState } from 'react';
import { CardShell, StatusPill } from '@/components/trusted';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUsage } from '@/hooks/useUsage';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { getFirebaseAuth } from '@/lib/firebase';

/**
 * Privacy and usage (PROGRESS.md Phase 8).
 *
 * The wording at the top is the product's stated commitment, not marketing copy: Symora
 * knows what the user intentionally told, typed, pasted or shared, and does not read
 * SMS. Putting it here, next to the export and delete controls, is the point — the
 * claim and the means to check it sit together.
 */
export function PrivacyPanel() {
  const { data: usage } = useUsage();
  const { signOutUser } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetched with the auth header and saved from a blob rather than linked directly:
   * /api/privacy/export needs the bearer token, which a plain <a href> cannot send.
   */
  async function handleExport() {
    setError(null);
    setIsExporting(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const response = await fetch('/api/privacy/export', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!response.ok) throw new Error('Export failed.');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `symora-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export your data.');
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await apiFetch('/api/privacy/delete', {
        method: 'POST',
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      // Signing out immediately: the account is gone, and staying on a signed-in screen
      // backed by nothing would be worse than a clean return to the login page.
      await signOutUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
      setIsDeleting(false);
    }
  }

  return (
    <CardShell as="section" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading" className="text-heading text-text-primary">
        Your data
      </h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Symora knows what you intentionally tell, type, paste, or share with it. It does not
        read your SMS and collects nothing on its own.
      </p>

      {usage && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-caption text-text-muted">AI requests in {usage.period}</dt>
            <dd className="mt-1 font-numeric text-amount tabular-nums text-text-primary">
              {usage.totals.requests}
              {usage.allowance !== null && (
                <span className="text-body-sm text-text-muted"> / {usage.allowance}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Tokens</dt>
            <dd className="mt-1 font-numeric text-amount tabular-nums text-text-primary">
              {usage.totals.totalTokens}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Resets</dt>
            <dd className="mt-1 text-body-sm text-text-primary">{usage.resetsOn}</dd>
          </div>
          {usage.aiMode === 'offline' && (
            <div className="w-full">
              <StatusPill tone="neutral" label="Offline mode — no AI calls are being made" />
            </div>
          )}
        </dl>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-body-sm font-medium text-text-primary">Take your data with you</p>
        <p className="mt-1 text-body-sm text-text-muted">
          Everything Symora holds about you, as one JSON file.
        </p>
        <Button type="button" variant="secondary" className="mt-2" onClick={() => void handleExport()} disabled={isExporting}>
          {isExporting ? 'Preparing…' : 'Export my data'}
        </Button>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-body-sm font-medium text-overdue">Delete everything</p>
        <p className="mt-1 text-body-sm text-text-muted">
          Your profile, memories, commitments, payments and chat history are removed
          permanently. This cannot be undone. Type <strong>DELETE</strong> to confirm.
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Label htmlFor="delete-confirm" className="block">
              Confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="DELETE"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleDelete()}
            disabled={confirmation !== 'DELETE' || isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete my account'}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-body-sm text-overdue">{error}</p>}
    </CardShell>
  );
}
