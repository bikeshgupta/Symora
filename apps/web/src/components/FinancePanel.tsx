import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/StatusBadge';
import {
  useCreateObligation,
  useFinanceSummary,
  useMarkInstancePaid,
  type NewObligation,
} from '@/hooks/useFinance';
import type { InstanceView } from '@symora/core';

const EMPTY_OBLIGATION: NewObligation = {
  accountName: '',
  obligationType: 'emi',
  amount: 0,
  currency: 'INR',
  dueDay: 1,
};

function PaymentRow({ view }: { view: InstanceView }) {
  const markPaid = useMarkInstancePaid();
  const { instance, obligation, state } = view;
  const isSettled = instance.status === 'paid' || instance.status === 'skipped';

  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-body-sm font-medium text-text-primary">{obligation.accountName}</span>
          <span className="ml-2 font-numeric text-amount tabular-nums text-text-primary">
            {obligation.currency} {instance.expectedAmount}
          </span>
        </div>
        {isSettled ? (
          <StatusBadge tone="paid" label={instance.status === 'paid' ? 'Paid' : 'Skipped'} />
        ) : (
          <StatusBadge
            tone={state.isOverdue ? 'overdue' : 'due-soon'}
            label={state.isOverdue ? `Overdue · due ${state.dueDate}` : `Due ${state.dueDate}`}
          />
        )}
      </div>

      {instance.status === 'partial' && (
        <p className="mt-1 text-caption text-text-muted">
          Paid {instance.paidAmount} · {obligation.currency} {state.outstandingFormatted} still
          outstanding
        </p>
      )}

      {!isSettled && (
        <Button
          type="button"
          variant="ghost"
          className="mt-2"
          disabled={markPaid.isPending}
          onClick={() => markPaid.mutate({ instanceId: instance.id })}
        >
          Mark paid
        </Button>
      )}
    </li>
  );
}

/**
 * Recurring obligations and this month's instances (PROGRESS.md Phase 4).
 *
 * The split on screen mirrors the one in the data model: the form creates a recurring
 * *definition*, and "Mark paid" writes to a monthly *instance*. Nothing here computes a
 * total — every figure comes from /api/finance, which derives it in code from stored
 * rows (.claude/rules/finance-rules.md).
 */
export function FinancePanel() {
  const [form, setForm] = useState<NewObligation>(EMPTY_OBLIGATION);
  const { data: summary, isLoading, isError, error } = useFinanceSummary();
  const create = useCreateObligation();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.accountName.trim() || form.amount <= 0) return;
    create.mutate(
      { ...form, accountName: form.accountName.trim() },
      { onSuccess: () => setForm(EMPTY_OBLIGATION) },
    );
  }

  const payments = summary ? [...summary.overdue, ...summary.upcoming] : [];

  return (
    <Card>
      <h2 className="text-heading text-text-primary">Payments</h2>
      <p className="mt-1 text-body-sm text-text-muted">
        Recurring obligations and what each month actually needs. Totals are computed from
        stored payments, never estimated.
      </p>

      {isLoading && <p className="mt-4 text-body-sm text-text-muted">Loading…</p>}
      {isError && (
        <p className="mt-4 text-body-sm text-overdue">
          {error instanceof Error ? error.message : 'Could not load your payments.'}
        </p>
      )}

      {summary && (
        <>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
            {summary.requirement.breakdown.length === 0 && (
              <div>
                <dt className="text-caption text-text-muted">Required in {summary.period}</dt>
                <dd className="text-body-sm text-text-muted">Nothing tracked yet</dd>
              </div>
            )}
            {summary.requirement.breakdown.map((line) => (
              <div key={`req-${line.currency}`}>
                <dt className="text-caption text-text-muted">Required in {summary.period}</dt>
                <dd className="font-numeric text-amount tabular-nums text-text-primary">
                  {line.currency} {line.totalFormatted}
                </dd>
              </div>
            ))}
            {summary.outstanding.map((line) => (
              <div key={`out-${line.currency}`}>
                <dt className="text-caption text-text-muted">Still outstanding</dt>
                <dd className="font-numeric text-amount tabular-nums text-text-primary">
                  {line.currency} {line.totalFormatted}
                </dd>
              </div>
            ))}
          </dl>

          {summary.overdue.length > 0 && (
            <p className="mt-3">
              <StatusBadge
                tone="overdue"
                label={`${summary.overdue.length} payment${summary.overdue.length === 1 ? '' : 's'} overdue`}
              />
            </p>
          )}

          {payments.length === 0 ? (
            <p className="mt-4 text-body-sm text-text-muted">
              Nothing due. Add a recurring payment below, or just tell Symora about it.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {payments.map((view) => (
                <PaymentRow key={view.instance.id} view={view} />
              ))}
            </ul>
          )}
        </>
      )}

      <form className="mt-5 border-t border-border pt-4" onSubmit={handleSubmit}>
        <p className="text-body-sm font-medium text-text-primary">Add a recurring payment</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="obligation-name" className="block">
              What
            </Label>
            <Input
              id="obligation-name"
              value={form.accountName}
              onChange={(event) => setForm({ ...form, accountName: event.target.value })}
              placeholder="Home loan"
            />
          </div>
          <div className="sm:w-36">
            <Label htmlFor="obligation-amount" className="block">
              Amount
            </Label>
            <Input
              id="obligation-amount"
              type="number"
              min={0}
              step="0.01"
              value={form.amount || ''}
              onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}
              placeholder="42500"
            />
          </div>
          <div className="sm:w-28">
            <Label htmlFor="obligation-day" className="block">
              Due day
            </Label>
            <Input
              id="obligation-day"
              type="number"
              min={1}
              max={31}
              value={form.dueDay}
              onChange={(event) => setForm({ ...form, dueDay: Number(event.target.value) })}
            />
          </div>
          <div className="sm:w-40">
            <Label htmlFor="obligation-type" className="block">
              Kind
            </Label>
            <select
              id="obligation-type"
              value={form.obligationType}
              onChange={(event) =>
                setForm({ ...form, obligationType: event.target.value as NewObligation['obligationType'] })
              }
              className="min-h-[44px] w-full rounded-md border border-border bg-surface px-3 text-body-sm text-text-primary"
            >
              <option value="emi">EMI</option>
              <option value="rent">Rent</option>
              <option value="bill">Bill</option>
              <option value="subscription">Subscription</option>
              <option value="insurance">Insurance</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <Button
          type="submit"
          className="mt-3"
          disabled={create.isPending || !form.accountName.trim() || form.amount <= 0}
        >
          Track this payment
        </Button>
        {create.isError && <p className="mt-2 text-caption text-overdue">Could not add that.</p>}
      </form>
    </Card>
  );
}
