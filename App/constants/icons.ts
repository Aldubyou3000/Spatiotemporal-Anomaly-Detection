/**
 * Central icon registry — every icon in the app is named by MEANING here and
 * mapped to one Feather glyph. One place to keep the icon language modern and
 * consistent; call sites reference `icons.foo` instead of hardcoding glyph names
 * so the same concept never renders two different ways.
 *
 * Style rules:
 *  • Feather is a single-weight, thin, geometric line set — the minimalist
 *    "Facebook"-style look. There is no outline/filled split, so the line/solid
 *    tab pairs below resolve to the SAME glyph; the active tab is distinguished
 *    by COLOR (brand tint) in the tab bar, not a heavier glyph.
 *  • Render every glyph through <Icon> (components/Icon.tsx), never <Feather>.
 */

import { IconName } from '@/components/Icon';

export type { IconName };

export const icons = {
  // ── Navigation / chevrons ──────────────────────────────────────────────────
  chevronRight: 'chevron-right'  as IconName,
  chevronDown:  'chevron-down'   as IconName,
  chevronUp:    'chevron-up'     as IconName,
  chevronLeft:  'chevron-left'   as IconName,
  close:        'x'              as IconName,
  removeItem:   'x-circle'       as IconName,
  expand:       'maximize-2'     as IconName,
  external:     'external-link'  as IconName,

  // ── Bottom tab indicator (active = brand color, not a different glyph) ─────
  tabActivityLine: 'activity'  as IconName,

  // ── Brand / identity ───────────────────────────────────────────────────────
  brandMark:  'activity' as IconName,
  technician: 'tool'     as IconName,

  // ── Status / feedback ──────────────────────────────────────────────────────
  success:    'check-circle'   as IconName,
  error:      'alert-circle'   as IconName,
  errorFill:  'alert-circle'   as IconName,
  warning:    'alert-triangle' as IconName,
  cancelled:  'slash'          as IconName,
  followUp:   'refresh-cw'     as IconName,
  check:      'check'          as IconName,

  // ── Ticket lifecycle (activity feed) ───────────────────────────────────────
  ticketNew:   'plus-circle'  as IconName,
  assigned:    'user-plus'    as IconName,
  statusChange:'repeat'       as IconName,
  edited:      'edit-2'       as IconName,
  reportDoc:   'file-text'    as IconName,
  fileUpload:  'upload-cloud' as IconName,
  photo:       'image'        as IconName,
  dot:         'circle'       as IconName,

  // ── Detail fields ──────────────────────────────────────────────────────────
  station:     'home'       as IconName,
  coordinates: 'navigation' as IconName,
  calendar:    'calendar'   as IconName,
  location:    'map-pin'    as IconName,
  time:        'clock'      as IconName,
  camera:      'camera'     as IconName,

  // ── Forms / auth ───────────────────────────────────────────────────────────
  user:        'user'     as IconName,
  username:    'at-sign'  as IconName,
  email:       'mail'     as IconName,
  phone:       'phone'    as IconName,
  stations:    'radio'    as IconName,
  password:    'lock'     as IconName,
  eyeShow:     'eye'      as IconName,
  eyeHide:     'eye-off'  as IconName,

  // ── Actions ────────────────────────────────────────────────────────────────
  search:      'search'      as IconName,
  help:        'help-circle' as IconName,
  share:       'share'       as IconName,
  logout:      'log-out'     as IconName,
  themeLight:  'sun'         as IconName,
  themeDark:   'moon'        as IconName,
  startWork:   'play'        as IconName,
  submitReport:'edit-2'      as IconName,
  send:        'send'        as IconName,

  // ── Misc document/attachment ────────────────────────────────────────────────
  attachment:  'file-text' as IconName,
} as const;
