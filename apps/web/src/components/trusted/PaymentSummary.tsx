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
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "2026-09" is a period key, not a heading. It is formatted here rather than parsed into
 * a Date: a month key has no instant in it, and constructing one would invite exactly the
 * timezone slip .claude/rules/finance-rules.md warns about. An unrecognised key is shown
 * as it is, never as "Invalid Date".
 */
function formatPeriod(period: string): string {
  const [year, month] = period.split('-');
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : period;
}

export function PaymentSummary({ payments }: { payments: HomePayload['payments'] }) {
  const hasAnything =
    payments.requiredByCurrency.length > 0 || payments.outstandingByCurrency.length > 0;

  return (
    <CardShell as="section" aria-labelledby="payments-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="payments-heading" className="text-heading text-text-primary">
          {formatPeriod(payments.period)}
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
        /* Two columns: the pair is a comparison — what the month needs against what is
           still owed — and stacking them loses that. Currencies get their own cells; a
           total across two of them would be an implicit conversion. */
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
          {payments.requiredByCurrency.map((line) => (
            <Total key={`required-${line.currency}`} label="Needed this month" line={line} />
          ))}
          {payments.outstandingByCurrency.map((line) => (
            <Total key={`outstanding-${line.currency}`} label="Still to pay" line={line} />
          ))}
        </dl>
      )}
    </CardShell>
  );
}

/**
 * One total. The currency is a label, not part of the number: at amount size it competes
 * with the digits, and the digits are what the user came to read.
 */
function Total({
  label,
  line,
}: {
  label: string;
  line: { currency: string; totalFormatted: string };
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-1">
        <span className="text-caption text-text-muted">{line.currency}</span>
        <span className="font-numeric text-amount tabular-nums text-text-primary">
          {line.totalFormatted}
        </span>
      </dd>
    </div>
  );
}
