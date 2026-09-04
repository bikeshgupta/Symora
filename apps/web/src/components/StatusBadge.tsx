import { cn } from '@/lib/cn';
import type { StatusTone } from '@/lib/status';

/**
 * .claude/rules/design-system.md: "Status is never colour alone. Every status is
 * communicated by colour AND a text label or icon." `label` is required in the props
 * for exactly that reason — there is no way to render this badge as a bare coloured dot.
 *
 * Not the Phase 6 trusted component; a shared primitive so the Phase 4/5 panels state
 * status consistently until those land.
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  overdue: 'bg-overdue-surface text-overdue',
  'due-soon': 'bg-due-soon-surface text-due-soon',
  paid: 'bg-paid-surface text-paid',
  neutral: 'bg-neutral-status-surface text-neutral-status',
};

const TONE_ICON: Record<StatusTone, string> = {
  overdue: '!',
  'due-soon': '◷',
  paid: '✓',
  neutral: '·',
};

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span aria-hidden="true">{TONE_ICON[tone]}</span>
      {label}
    </span>
  );
}
