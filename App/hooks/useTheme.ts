import { useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { getTheme, type Theme } from '@/constants/theme';

/**
 * Centralized theme access. Use this everywhere instead of branching on
 * `isDarkMode` and hard-coding hex values inline.
 *
 * Memoized on `isDarkMode` so the returned object keeps a stable reference
 * between renders — only a real theme toggle produces a new object. Without
 * this, every render minted a fresh object (`{ ...getTheme(), isDark }`),
 * forcing every one of the ~39 consumers to re-render on any parent update.
 */
export function useTheme(): Theme & { isDark: boolean } {
  const { isDarkMode } = useAppContext();
  return useMemo(() => ({ ...getTheme(isDarkMode), isDark: isDarkMode }), [isDarkMode]);
}
