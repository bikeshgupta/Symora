import { cn } from '@/lib/cn';

/**
 * The one exception to the card shell (.claude/rules/design-system.md): `--radius-full`,
 * low elevation, `--color-surface-raised` background. It is a passive suggestion and
 * should recede rather than compete with the cards around it.
 *
 * Tapping one fills the Ask Symora input rather than executing anything — a chip is a
 * shortcut into the same pipeline, so it cannot bypass a confirmation gate.
 */
export function SuggestionChip({
  label,
  onSelect,
  className,
}: {
  label: string;
  onSelect: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface-raised px-4',
        'text-body-sm text-text-primary transition-colors hover:bg-surface',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        className,
      )}
    >
      {label}
    </button>
  );
}
