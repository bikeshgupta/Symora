/**
 * A minimal card shell. Not the Phase 6 CardShell primitive the seven trusted
 * components share — just the base radius/border/shadow rhythm from
 * .claude/rules/design-system.md § Geometry, reused here for Login/Home.
 */

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-6',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';
