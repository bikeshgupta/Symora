import { CardShell, StatusPill } from '@/components/trusted';
import { Button } from '@/components/ui/button';
import { useHealth, type Health } from '@/hooks/useHealth';

/**
 * What is actually answering.
 *
 * When the database is down every endpoint fails at once, and the platform's error page
 * carries no code and no request id — which reads as "the whole app is broken" and gives
 * nobody a next step. This is the next step, in the one place a phone can reach: it names
 * which dependency is at fault and what to go and change.
 *
 * It shows states, never internals. The server has the failing table and the driver's
 * message in its log; this says "some tables are missing", which is what the person
 * reading it can act on (.claude/rules/auth-security.md § Errors and logging).
 */
function databaseLine(health: Health): { tone: 'paid' | 'due-soon' | 'overdue'; label: string; detail: string } {
  switch (health.database) {
    case 'ok':
      return {
        tone: 'paid',
        label: 'Connected',
        detail: `All ${health.tables.expected} tables answered.`,
      };
    case 'schema_incomplete':
      return {
        tone: 'due-soon',
        label: 'Tables missing',
        detail: `${health.tables.answered} of ${health.tables.expected} tables answered. Apply the migrations in supabase/migrations, then check again.`,
      };
    case 'unreachable':
      return {
        tone: 'overdue',
        label: 'Not answering',
        detail:
          'The database did not reply. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the deployment, and whether the Supabase project is paused.',
      };
  }
}

const MODEL_LABEL: Record<Health['model']['status'], { tone: 'paid' | 'due-soon' | 'neutral'; label: string }> = {
  ready: { tone: 'paid', label: 'Answering' },
  rate_limited: { tone: 'due-soon', label: 'Rate limited' },
  unreachable: { tone: 'due-soon', label: 'Not answering' },
  offline: { tone: 'neutral', label: 'Not configured' },
};

export function HealthPanel() {
  const { data, isLoading, isError, error, refetch, isFetching } = useHealth(true);

  return (
    <CardShell as="section" aria-labelledby="health-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="health-heading" className="text-heading text-text-primary">
          Connection check
        </h2>
        <Button variant="ghost" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? 'Checking…' : 'Check again'}
        </Button>
      </div>
      <p className="mt-1 text-body-sm text-text-muted">
        What this deployment can actually reach right now.
      </p>

      {isLoading && <p className="mt-3 text-body-sm text-text-muted">Checking…</p>}

      {isError && (
        <p className="mt-3 text-body-sm text-overdue">
          {error instanceof Error ? error.message : "The check itself couldn't run."}
        </p>
      )}

      {data && (
        <dl className="mt-4 flex flex-col gap-4">
          {(() => {
            const line = databaseLine(data);
            return (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <dt className="text-body-sm font-medium text-text-primary">Database</dt>
                  <StatusPill tone={line.tone} label={line.label} />
                </div>
                <dd className="mt-1 text-caption text-text-muted">{line.detail}</dd>
              </div>
            );
          })()}

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-body-sm font-medium text-text-primary">{data.model.provider}</dt>
              <StatusPill
                tone={MODEL_LABEL[data.model.status].tone}
                label={MODEL_LABEL[data.model.status].label}
              />
            </div>
            <dd className="mt-1 text-caption text-text-muted">
              {data.model.mode === 'offline'
                ? 'No model configured, so Symora is using its built-in parser. Everything deterministic is unaffected.'
                : 'Used only for messages the built-in parser cannot read.'}
            </dd>
          </div>
        </dl>
      )}
    </CardShell>
  );
}
