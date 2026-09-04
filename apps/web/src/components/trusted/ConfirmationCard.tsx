import { useMemo, useState } from 'react';
import type { ChatConfirmationField } from '@symora/core';
import { CardShell } from './CardShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
 * The values are rendered exactly as they were parsed, and confirming re-posts that same
 * already-parsed tool call rather than re-running extraction — so what the user approved
 * is what executes (.claude/rules/ai-pipeline.md).
 *
 * **Editing does not weaken that.** Correcting a field changes the arguments the user is
 * approving, and they still approve them from this card; extraction is not re-run, so a
 * correction cannot turn into a differently-parsed request. The corrected arguments are
 * validated against the same tool schema server-side, which was already true of every
 * confirmation — the client has always sent the arguments back.
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
  fields: ChatConfirmationField[];
  /** Optional context, e.g. that this came from a pasted message or a voice amount. */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Called with only the fields the user actually changed, keyed by argument name, so
   * the caller can write them over the parsed arguments. Empty when nothing was edited.
   */
  onConfirm: (edits: Record<string, string>) => void;
  onCancel: () => void;
  isBusy?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  // Editable fields only. An unset value renders as an em dash, which is not something
  // the user can meaningfully correct into a valid argument.
  const editable = useMemo(() => fields.filter((field) => field.value !== '—'), [fields]);

  const edits = useMemo(() => {
    const changed: Record<string, string> = {};
    for (const field of fields) {
      const next = values[field.key];
      if (next !== undefined && next.trim() !== field.value) changed[field.key] = next.trim();
    }
    return changed;
  }, [fields, values]);

  const blankField = editable.find((field) => values[field.key]?.trim() === '');

  function startEditing() {
    setValues(Object.fromEntries(editable.map((field) => [field.key, field.value])));
    setIsEditing(true);
  }

  return (
    <CardShell emphasis="gated" as="section" role="group" aria-label="Confirm before Symora acts">
      <div className="-mx-5 -mt-5 mb-4 rounded-t-lg bg-primary/10 px-5 py-3 sm:-mx-6 sm:-mt-6 sm:px-6">
        <p className="text-body-sm font-medium text-text-primary">{question}</p>
        {note && <p className="mt-1 text-caption text-text-muted">{note}</p>}
      </div>

      {isEditing ? (
        <div className="grid gap-3">
          {editable.map((field) => (
            <div key={field.key} className="grid gap-1">
              <label className="text-caption text-text-muted" htmlFor={`confirm-${field.key}`}>
                {field.label}
              </label>
              <Input
                id={`confirm-${field.key}`}
                type={field.editor === 'number' ? 'number' : field.editor === 'date' ? 'date' : 'text'}
                inputMode={field.editor === 'number' ? 'decimal' : undefined}
                value={values[field.key] ?? ''}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
                disabled={isBusy}
              />
            </div>
          ))}
          {blankField && (
            // Colour alone never carries a state here (design-system.md); the icon and
            // the sentence do the work, and the colour reinforces them.
            <p className="text-caption text-overdue" role="alert">
              <span aria-hidden="true">! </span>
              {blankField.label} can&apos;t be empty.
            </p>
          )}
        </div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {fields.map((field) => (
            <div key={field.key} className="contents">
              <dt className="text-caption text-text-muted">{field.label}</dt>
              <dd className="text-body-sm text-text-primary">{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" onClick={() => onConfirm(edits)} disabled={isBusy || Boolean(blankField)}>
          {confirmLabel}
        </Button>
        {!isEditing && editable.length > 0 && (
          <Button type="button" variant="secondary" onClick={startEditing} disabled={isBusy}>
            {/* A glyph rather than an icon dependency, matching StatusPill: it carries the
                same redundant signal and cannot fail to load. */}
            <span aria-hidden="true">✎</span>
            Edit
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isBusy}>
          {cancelLabel}
        </Button>
      </div>

      {isEditing && (
        <p className="mt-3 text-caption text-text-muted">
          Symora will save these values, not what it first understood.
        </p>
      )}
    </CardShell>
  );
}
