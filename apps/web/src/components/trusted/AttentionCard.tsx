import { CardShell } from './CardShell';
import { StatusPill, type StatusTone } from './StatusPill';
import type { AttentionItem } from '@symora/core';

/**
 * "Needs Attention" — the first thing on the home screen, and the reason the home screen
 * is not a dashboard: it answers "what needs me today?" rather than listing everything.
 *
 * The ranking, the wording of each status label and the day counts all arrive computed
 * from `/api/home`. This component renders them and nothing else — no total is derived
 * here (.claude/rules/ai-pipeline.md: the model, and the client, never produce numbers
 * that matter).
 */
const TONE_MAP: Record<AttentionItem['tone'], StatusTone> = {
  overdue: 'overdue',
  'due-soon': 'due-soon',
  neutral: 'neutral',
};

export function AttentionCard({
  items,
  onSelect,
}: {
  items: AttentionItem[];
  onSelect?: (item: AttentionItem) => void;
}) {
  return (
    <CardShell as="section" aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="text-heading text-text-primary">
        Needs attention
      </h2>

      {items.length === 0 ? (
        <p className="mt-2 text-body-sm text-text-muted">
          Nothing needs you right now. Symora will say so when something does.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(item)}
                    className="text-left text-body-sm font-medium text-text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    {item.title}
                  </button>
                ) : (
                  <p className="text-body-sm font-medium text-text-primary">{item.title}</p>
                )}
                <p className="mt-1 text-caption text-text-muted">{item.detail}</p>
              </div>
              <StatusPill tone={TONE_MAP[item.tone]} label={item.statusLabel} />
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
