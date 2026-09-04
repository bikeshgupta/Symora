import { CardShell } from './CardShell';
import { StatusPill } from './StatusPill';
import type { HomePayload } from '@symora/core';

/**
 * This month's money, in the two numbers that actually matter: what the month requires
 * and what is still owed.
 *
 * Both are computed server-side from stored instances and arrive pre-formatted as
 * decimal strings — this component never parses them into a float or adds anything up
 * (.claude/rules/finance-rules.md: no floating point arithmetic on money). Currencies are
 * listed separately rather than combined, because a single cross-currency total would be
 * an implicit conversion.
 */
export function PaymentSummary({ payments }: { payments: HomePayload['payments'] }) {
  const hasAnything =
    payments.requiredByCurrency.length > 0 || payments.outstandingByCurrency.length > 0;

  return (
    <CardShell as="section" aria-labelledby="payments-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="payments-heading" className="text-heading text-text-primary">
          {payments.period}
        </h2>
        {payments.overdueCount > 0 && (
          <StatusPill
            tone="overdue"
            label={`${payments.overdueCount} overdue`}
          />
        )}
      </div>

      {!hasAnything ? (
        <p className="mt-2 text-body-sm text-text-muted">
          No recurring payments tracked yet.
        </p>
      ) : (
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
          {payments.requiredByCurrency.map((line) => (
            <div key={`required-${line.currency}`}>
              <dt className="text-caption text-text-muted">Needed this month</dt>
              <dd className="mt-1 font-numeric text-amount tabular-nums text-text-primary">
                {line.currency} {line.totalFormatted}
              </dd>
            </div>
          ))}
          {payments.outstandingByCurrency.map((line) => (
            <div key={`outstanding-${line.currency}`}>
              <dt className="text-caption text-text-muted">Still to pay</dt>
              <dd className="mt-1 font-numeric text-amount tabular-nums text-text-primary">
                {line.currency} {line.totalFormatted}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </CardShell>
  );
}
