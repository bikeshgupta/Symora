import { CardShell } from '@/components/trusted';
import type { RuntimeCapabilities } from '@/hooks/useMe';

/**
 * Says plainly when the deployment is running without an AI provider.
 *
 * Everything deterministic works either way — commitments, payments, reminders, memory,
 * the home screen. What changes is that language understanding is pattern-based rather
 * than a model, and drafts are templates. Saying so is better than letting a pilot user
 * conclude the understanding is simply bad.
 */
export function ModeBanner({ capabilities }: { capabilities: RuntimeCapabilities }) {
  if (capabilities.aiMode === 'ai') return null;

  return (
    <CardShell className="bg-surface-raised">
      <p className="text-body-sm font-medium text-text-primary">Running without an AI key</p>
      <p className="mt-1 text-body-sm text-text-muted">
        Everything that doesn&apos;t need AI works normally — payments, tasks, reminders,
        memory and your home screen. Typed and spoken requests are understood by pattern
        matching rather than a model, so keep them close to the examples; message drafts
        come from templates. Add an AI key later and the same features get smarter without
        anything moving.
      </p>
    </CardShell>
  );
}
