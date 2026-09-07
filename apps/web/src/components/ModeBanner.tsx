import { CardShell } from '@/components/trusted';
import type { RuntimeCapabilities } from '@/hooks/useMe';

/**
 * Says plainly which of the three model states this deployment is in.
 *
 * `offline` and `unreachable` must not share a word (CLAUDE.md): one is a deployment
 * nobody has configured, the other is a machine the user can switch back on, and sending
 * someone to edit environment variables when their laptop is simply asleep wastes an
 * afternoon. Everything deterministic — commitments, payments, reminders, memory, this
 * screen — works in all three.
 */
export function ModeBanner({ capabilities }: { capabilities: RuntimeCapabilities }) {
  if (capabilities.modelStatus === 'ready') return null;

  const unreachable = capabilities.modelStatus === 'unreachable';

  return (
    <CardShell className="bg-surface-raised">
      <p className="text-body-sm font-medium text-text-primary">
        {unreachable
          ? capabilities.selfHostedModel
            ? 'Your own model is not answering'
            : 'The AI provider is not answering'
          : 'Running without an AI key'}
      </p>
      <p className="mt-1 text-body-sm text-text-muted">
        {unreachable
          ? 'Symora tried and got no reply, so it has fallen back to pattern matching until the endpoint answers again. Nothing is lost — payments, tasks, reminders, memory and this screen are unchanged, and requests keep working if you phrase them close to the examples.'
          : "Everything that doesn't need AI works normally — payments, tasks, reminders, memory and your home screen. Typed and spoken requests are understood by pattern matching rather than a model, so keep them close to the examples; message drafts come from templates. Add an AI key later and the same features get smarter without anything moving."}
      </p>
    </CardShell>
  );
}
