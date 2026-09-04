import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/**
 * The one card shell all seven trusted components are built on
 * (.claude/rules/design-system.md § Rules for the Phase 6 trusted components):
 * `--radius-lg` corners, `--color-surface` background, a 1px `--color-border` edge,
 * `--shadow-sm` at rest, and the standard 20/24px padding rhythm.
 *
 * A component must not invent its own radius, padding or elevation — consistency across
 * the set is what makes the home screen read as calm rather than assembled.
 *
 * The one sanctioned variation is `emphasis="gated"`, reserved for `ConfirmationCard`:
 * a 2px primary border and a heavier shadow, so "this will change your data" is never
 * mistakable for a passive informational card. Nothing else may use it.
 *
 * No forwardRef: nothing in the set needs a ref, and a polymorphic `as` plus a forwarded
 * ref cannot be typed soundly without more machinery than a card shell warrants.
 */
export interface CardShellProps extends HTMLAttributes<HTMLElement> {
  emphasis?: 'default' | 'gated';
  as?: 'div' | 'section' | 'li' | 'article';
}

export function CardShell({
  className,
  emphasis = 'default',
  as: Tag = 'div',
  ...props
}: CardShellProps) {
  return (
    <Tag
      className={cn(
        'rounded-lg bg-surface p-5 sm:p-6',
        emphasis === 'gated' ? 'border-2 border-primary shadow-lg' : 'border border-border shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
