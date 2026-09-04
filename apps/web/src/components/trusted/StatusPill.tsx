import { cn } from '@/lib/cn';

/**
 * .claude/rules/design-system.md: "Status is never colour alone. Every status is
 * communicated by colour AND a text label or icon."
 *
 * `label` is a required prop, and there is no variant that renders without it. That is
 * the enforcement — a red dot with no word is invisible to a colour-blind user and
 * meaningless in a screenshot, so the component makes it impossible to build one.
 *
 * Status colours are used as text on a soft tint, never as a large filled background,
 * which is what keeps both themes above the AA contrast floor.
 */
export type StatusTone = 'overdue' | 'due-soon' | 'paid' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  overdue: 'bg-overdue-surface text-overdue',
  'due-soon': 'bg-due-soon-surface text-due-soon',
  paid: 'bg-paid-surface text-paid',
  neutral: 'bg-neutral-status-surface text-neutral-status',
};

// Glyphs rather than an icon dependency: they carry the same redundant signal and cannot
// fail to load. Marked aria-hidden because the adjacent label already says it.
const TONE_GLYPH: Record<StatusTone, string> = {
  overdue: '!',
  'due-soon': '◷',
  paid: '✓',
  neutral: '·',
};

export function StatusPill({
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
      <span aria-hidden="true">{TONE_GLYPH[tone]}</span>
      <span>{label}</span>
    </span>
  );
}
