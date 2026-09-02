import { Moon, Sun, SunMoon } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

const OPTIONS: { value: ThemePreference; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light theme' },
  { value: 'system', icon: SunMoon, label: 'Match system theme' },
  { value: 'dark', icon: Moon, label: 'Dark theme' },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised p-1">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
            preference === value
              ? 'bg-primary text-primary-foreground'
              : 'text-text-muted hover:text-text-primary',
          )}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
