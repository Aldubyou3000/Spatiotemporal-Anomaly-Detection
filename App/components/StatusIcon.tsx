/**
 * StatusIcon — the FILLED glyph used inside a ticket's status avatar.
 *
 * The rest of the app renders Feather (a thin single-weight outline set, see
 * components/Icon.tsx). Status badges want a solid, heavier shape so the colored
 * avatar reads as a confident, modern token rather than a faint outline — so
 * this one surface renders *Ionicons filled* instead. The status→glyph map lives
 * in constants/ticketStatus.ts (statusGlyph), keeping it the single source of
 * truth alongside the status colors.
 */

import { Ionicons } from '@expo/vector-icons';
import { statusGlyph } from '@/constants/ticketStatus';

type Props = {
  status: string | null | undefined;
  size?: number;
  color?: string;
};

export default function StatusIcon({ status, size = 19, color }: Props) {
  return <Ionicons name={statusGlyph(status)} size={size} color={color} />;
}
