import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex min-h-[44px] w-full rounded-md border border-border bg-surface px-3 text-body-sm ' +
        'text-text-primary placeholder:text-text-muted focus-visible:outline-focus-ring ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';
