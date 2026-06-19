/**
 * Icon — the single rendering primitive for every glyph in the app.
 *
 * We render the *Feather* family: a thin, single-weight, geometric line set —
 * the minimalist "Facebook"-style look the product wants. Because Feather has
 * one uniform weight (no outline/filled split like Ionicons), active states are
 * expressed through *color* (and the optional `fill` prop), not a heavier glyph.
 *
 * Every call site references a semantic name from `icons` (constants/icons.ts),
 * so the icon language stays consistent and a future family swap touches one
 * file. Pass `icons.foo`, never a raw glyph string.
 */

import { Feather } from '@expo/vector-icons';
import { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Feather>['name'];

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  style?: ComponentProps<typeof Feather>['style'];
};

export default function Icon({ name, size = 18, color, style }: IconProps) {
  return <Feather name={name} size={size} color={color} style={style} />;
}
