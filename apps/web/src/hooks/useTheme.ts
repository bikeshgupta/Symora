/**
 * Three states — light, dark, system (.claude/rules/design-system.md § Theme
 * switching). index.html already applies the resolved theme before first paint; this
 * hook keeps the DOM class in sync when the user changes their choice, and follows the
 * OS live while on "system".
 */

import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'symora-theme';

function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to system.
  }
  return 'system';
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function resolve() {
      const dark = preference === 'dark' || (preference === 'system' && media.matches);
      applyTheme(dark);
    }

    resolve();
    if (preference === 'system') {
      media.addEventListener('change', resolve);
      return () => media.removeEventListener('change', resolve);
    }
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore — the in-memory state still drives the current session.
    }
  }, []);

  return { preference, setPreference };
}
