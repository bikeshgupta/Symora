import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Symora's mark: a primary-tinted rounded square. Used as the app's identity in the
 * header and as the assistant's avatar in the transcript, so the two read as the same
 * voice rather than two different products.
 */
export function SymoraMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'lg' ? 'h-12 w-12 rounded-lg' : size === 'md' ? 'h-8 w-8 rounded-md' : 'h-7 w-7 rounded-md';
  const icon = size === 'lg' ? 22 : size === 'md' ? 16 : 14;

  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center bg-primary/10 text-primary', box, className)}
    >
      <Sparkles size={icon} />
    </span>
  );
}
