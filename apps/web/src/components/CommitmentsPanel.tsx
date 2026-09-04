import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/StatusBadge';
import { urgencyLabel, urgencyTone } from '@/lib/status';
import {
  useCancelCommitment,
  useCommitments,
  useCreateCommitment,
  useUpdateCommitment,
  type NewCommitment,
} from '@/hooks/useCommitments';
import type { CommitmentView } from '@symora/core';

const TYPE_LABEL: Record<string, string> = {
  TASK: 'Task',
  REMINDER: 'Reminder',
  IMPORTANT_DATE: 'Important date',
  PAYMENT: 'Payment',
};

function CommitmentRow({ commitment }: { commitment: CommitmentView }) {
  const update = useUpdateCommitment();
  const cancel = useCancelCommitment();
  const isDone = commitment.status === 'done';

  // The fire date only earns a mention when it differs from the due date — otherwise
  // "Due 10 Sep · reminds 10 Sep" is noise.
  const showsLeadTime =
    commitment.fireDate !== null &&
    commitment.nextOccurrence !== null &&
    commitment.fireDate !== commitment.nextOccurrence;

  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-caption text-text-muted">{TYPE_LABEL[commitment.type]}</span>
          <span className="ml-2 text-body-sm font-medium text-text-primary">{commitment.title}</span>
        </div>
        {isDone ? (
          <StatusBadge tone="paid" label="Done" />
        ) : (
          <StatusBadge
            tone={urgencyTone(commitment.urgency)}
            label={urgencyLabel(commitment.urgency, commitment.nextOccurrence ?? commitment.dueDate)}
          />
        )}
      </div>

      {(showsLeadTime || commitment.recurrence !== 'none') && (
        <p className="mt-1 text-caption text-text-muted">
          {commitment.recurrence !== 'none' && <span>Repeats {commitment.recurrence}</span>}
          {showsLeadTime && commitment.recurrence !== 'none' && <span> · </span>}
          {showsLeadTime && <span>Reminds you on {commitment.fireDate}</span>}
        </p>
      )}

      {!isDone && (
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={update.isPending}
            onClick={() => update.mutate({ id: commitment.id, status: 'done' })}
          >
            Mark done
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(commitment.id)}
          >
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * The commitments umbrella (PROGRESS.md Phase 4): tasks, reminders and important dates
 * in one list, because that is how the data model treats them. Payments live in
 * FinancePanel — their state is on instances, not on the commitment row.
 */
export function CommitmentsPanel() {
  const [form, setForm] = useState<NewCommitment>({ type: 'TASK', title: '' });
  const { data: commitments, isLoading, isError, error } = useCommitments('pending');
  const create = useCreateCommitment();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    create.mutate(
      {
        ...form,
        title: form.title.trim(),
        dueDate: form.dueDate || undefined,
        recurrenceRule: form.type === 'IMPORTANT_DATE' ? 'yearly' : undefined,
      },
      { onSuccess: () => setForm({ type: form.type, title: '' }) },
    );
  }

  return (
    <Card>
      <h2 className="text-heading text-text-primary">Commitments</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Tasks, reminders and important dates. Payments are tracked separately below.
      </p>

      {isLoading && <p className="mt-4 text-body-sm text-text-muted">Loading…</p>}
      {isError && (
        <p className="mt-4 text-body-sm text-overdue">
          {error instanceof Error ? error.message : 'Could not load your commitments.'}
        </p>
      )}
      {commitments && commitments.length === 0 && (
        <p className="mt-4 text-body-sm text-text-muted">Nothing pending.</p>
      )}
      {commitments && commitments.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {commitments.map((commitment) => (
            <CommitmentRow key={commitment.id} commitment={commitment} />
          ))}
        </ul>
      )}

      <form className="mt-5 border-t border-border pt-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-44">
            <Label htmlFor="commitment-type" className="block">
              Kind
            </Label>
            <select
              id="commitment-type"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as NewCommitment['type'] })}
              className="min-h-[44px] w-full rounded-md border border-border bg-surface px-3 text-body-sm text-text-primary"
            >
              <option value="TASK">Task</option>
              <option value="REMINDER">Reminder</option>
              <option value="IMPORTANT_DATE">Important date</option>
            </select>
          </div>
          <div className="flex-1">
            <Label htmlFor="commitment-title" className="block">
              What
            </Label>
            <Input
              id="commitment-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Call the electrician"
            />
          </div>
          <div className="sm:w-40">
            <Label htmlFor="commitment-date" className="block">
              When
            </Label>
            <Input
              id="commitment-date"
              type="date"
              value={form.dueDate ?? ''}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </div>
        </div>

        {form.type === 'REMINDER' && (
          <div className="mt-2 sm:w-56">
            <Label htmlFor="commitment-lead" className="block">
              Remind me this many days before
            </Label>
            <Input
              id="commitment-lead"
              type="number"
              min={0}
              max={365}
              value={form.leadDays ?? ''}
              onChange={(event) =>
                setForm({ ...form, leadDays: event.target.value ? Number(event.target.value) : undefined })
              }
              placeholder="2"
            />
          </div>
        )}

        <Button type="submit" className="mt-3" disabled={create.isPending || !form.title.trim()}>
          Add
        </Button>
        {create.isError && <p className="mt-2 text-caption text-overdue">Could not add that.</p>}
      </form>
    </Card>
  );
}
