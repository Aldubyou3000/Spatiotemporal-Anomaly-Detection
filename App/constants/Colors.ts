/**
 * Base colors for the themed <Text>/<View> primitives in components/Themed.tsx.
 * Kept in sync with the light/dark Theme objects in theme.ts so a <Text> with no
 * explicit color still renders the correct token (not pure #000 / #fff).
 */
import { lightTheme, darkTheme, palette } from './theme';

export default {
  light: {
    text: lightTheme.text,
    background: lightTheme.bg,
    tint: palette.brand,
  },
  dark: {
    text: darkTheme.text,
    background: darkTheme.bg,
    tint: palette.brand,
  },
};
