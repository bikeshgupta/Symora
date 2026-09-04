import { CardShell } from './CardShell';
import { StatusPill } from './StatusPill';
import { urgencyLabel, urgencyTone } from '@/lib/status';
import type { CommitmentView } from '@symora/core';

/**
 * A list of commitments of any type — the generic member of the trusted set.
 * `TaskList` is the task-specific specialisation on top of it.
 *
 * Every row states its status in words as well as colour, via StatusPill.
 */
export function CommitmentList({
  title,
  commitments,
  emptyMessage,
  onComplete,
}: {
  title: string;
  commitments: CommitmentView[];
  emptyMessage: string;
  onComplete?: (commitment: CommitmentView) => void;
}) {
  return (
    <CardShell as="section">
      <h2 className="text-heading text-text-primary">{title}</h2>

      {commitments.length === 0 ? (
        <p className="mt-2 text-body-sm text-text-muted">{emptyMessage}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {commitments.map((commitment) => {
            const due = commitment.nextOccurrence ?? commitment.dueDate;
            return (
              <li
                key={commitment.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-text-primary">{commitment.title}</p>
                  {commitment.recurrence !== 'none' && (
                    <p className="mt-1 text-caption text-text-muted">
                      Repeats {commitment.recurrence}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill
                    tone={commitment.status === 'done' ? 'paid' : urgencyTone(commitment.urgency)}
                    label={
                      commitment.status === 'done'
                        ? 'Done'
                        : urgencyLabel(commitment.urgency, due)
                    }
                  />
                  {onComplete && commitment.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => onComplete(commitment)}
                      className="min-h-[44px] rounded-md px-2 text-caption text-text-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      Mark done
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}
