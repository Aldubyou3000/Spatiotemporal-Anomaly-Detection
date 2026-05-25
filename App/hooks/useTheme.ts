import { useAppContext } from '@/context/AppContext';
import { getTheme, type Theme } from '@/constants/theme';

/**
 * Centralized theme access. Use this everywhere instead of branching on
 * `isDarkMode` and hard-coding hex values inline.
 */
export function useTheme(): Theme & { isDark: boolean } {
  const { isDarkMode } = useAppContext();
  return { ...getTheme(isDarkMode), isDark: isDarkMode };
}
