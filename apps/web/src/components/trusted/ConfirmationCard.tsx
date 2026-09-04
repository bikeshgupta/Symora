import { CardShell } from './CardShell';
import { Button } from '@/components/ui/button';

/**
 * The gate on a high-impact write — a recurring obligation, a payment marked paid, a
 * deletion, anything derived from pasted text or from a spoken amount.
 *
 * .claude/rules/design-system.md requires this to be impossible to mistake for a passive
 * informational card, and lists exactly how: the 2px primary border (via CardShell's
 * `gated` emphasis, which nothing else may use), `--shadow-lg`, a primary-tinted header
 * strip, an explicit question as the title, the parsed values shown verbatim as a
 * labelled list, and two clearly separated actions where confirm is filled and cancel is
 * not.
 *
 * The values are rendered exactly as they were parsed. Confirming re-posts that same
 * already-parsed tool call rather than re-running extraction, so what the user approved
 * is what executes (.claude/rules/ai-pipeline.md).
 */
export function ConfirmationCard({
  question,
  fields,
  note,
  confirmLabel = 'Yes, do it',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isBusy = false,
}: {
  question: string;
  fields: { label: string; value: string }[];
  /** Optional context, e.g. that this came from a pasted message or a voice amount. */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy?: boolean;
}) {
  return (
    <CardShell emphasis="gated" as="section" role="group" aria-label="Confirm before Symora acts">
      <div className="-mx-5 -mt-5 mb-4 rounded-t-lg bg-primary/10 px-5 py-3 sm:-mx-6 sm:-mt-6 sm:px-6">
        <p className="text-body-sm font-medium text-text-primary">{question}</p>
        {note && <p className="mt-1 text-caption text-text-muted">{note}</p>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        {fields.map((field) => (
          <div key={field.label} className="contents">
            <dt className="text-caption text-text-muted">{field.label}</dt>
            <dd className="text-body-sm text-text-primary">{field.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" onClick={onConfirm} disabled={isBusy}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isBusy}>
          {cancelLabel}
        </Button>
      </div>
    </CardShell>
  );
}
