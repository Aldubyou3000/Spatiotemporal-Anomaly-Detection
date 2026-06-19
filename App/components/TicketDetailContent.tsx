import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { LinearGradient } from 'expo-linear-gradient';

import Icon, { type IconName } from '@/components/Icon';
import { Text } from '@/components/Themed';
import { icons } from '@/constants/icons';
import { spring } from '@/constants/Motion';
import { elevation, palette, radius, spacing, typography } from '@/constants/theme';
import { statusColor, priorityColor, STATUS_LABEL, PRIORITY_LABEL } from '@/constants/ticketStatus';
import { useTheme } from '@/hooks/useTheme';
import {
  useReportPhotos,
  useTicketAttachments,
  useTicketDetail,
  useTicketReport,
} from '@/hooks/useTickets';
import {
  MaintenanceTicket,
  ReportPhoto,
  TicketAttachment,
  TicketReportSummary,
} from '@/services/api';

// Photo mosaic tile math: 2 tiles per row inside a panel.
// screenWidth − (2 × 16 screen pad) − (2 × 16 panel pad) − 4 gap, ÷ 2.
const SCREEN_W = Dimensions.get('window').width;
const PHOTO_GAP = spacing.xxs; // 4
const MOSAIC_TILE = (SCREEN_W - spacing.md * 2 - spacing.md * 2 - PHOTO_GAP) / 2;
const HISTORY_THUMB = 64;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Panel — elevated white surface card (Facebook/grouped-settings style) ────
// The structural unit of the new layout: a pure-white surface that lifts off the
// soft-grey screen backdrop with a diffused shadow. All grouped data lives in
// one of these.
function Panel({
  children, style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, shadowColor: theme.shadow }, style]}>
      {children}
    </View>
  );
}

// ─── Panel section label — muted uppercase overline header ────────────────────
function PanelLabel({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.panelLabel, { color: theme.text }]}>{children}</Text>;
}

// ─── Status + priority + zone chips row ──────────────────────────────────────
function ChipsRow({
  statusKey, priority, anomalyZone,
}: {
  statusKey: string; priority: string; anomalyZone?: string | null;
}) {
  const theme = useTheme();
  const sc = statusColor(statusKey, theme.status);
  const pc = priorityColor(priority, theme.status);

  return (
    <View style={styles.chipsRow}>
      <View style={[styles.chip, { backgroundColor: sc.bg }]}>
        <Text style={[styles.chipText, { color: sc.color }]}>
          {STATUS_LABEL[statusKey] ?? statusKey}
        </Text>
      </View>
      {/* Priority chip on every ticket (consistency) — color carries the weight */}
      <View style={[styles.chip, { backgroundColor: pc.bg }]}>
        <Text style={[styles.chipText, { color: pc.color }]}>
          {PRIORITY_LABEL[priority] ?? priority} priority
        </Text>
      </View>
      {anomalyZone ? (
        <View style={[styles.chip, { backgroundColor: theme.surfaceAlt }]}>
          <Text style={[styles.chipText, { color: theme.textMuted }]}>Zone {anomalyZone}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Callout banner — full-width tinted strip, no shadow (Panel B) ────────────
function Callout({ icon, accent, tint, title, body }: {
  icon: IconName; accent: string; tint: string; title: string; body?: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.callout, { backgroundColor: tint }]}>
      <Icon name={icon} size={16} color={accent} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.calloutTitle, { color: theme.text }]}>{title}</Text>
        {body ? <Text style={[styles.calloutBody, { color: theme.textSecondary }]}>{body}</Text> : null}
      </View>
    </View>
  );
}

// ─── Detail row — icon + muted key (left) | bold value (right) ────────────────
function DetailRow({ icon, label, value, last }: {
  icon: IconName; label: string; value: string; last?: boolean;
}) {
  const theme = useTheme();
  return (
    <>
      <View style={styles.detailRow}>
        <Icon name={icon} size={16} color={theme.textMuted} style={styles.detailIcon} />
        <Text style={[styles.detailLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: theme.text }]} numberOfLines={2}>{value}</Text>
      </View>
      {/* Hairline inset to align with the label text start, not the icon edge. */}
      {!last && <View style={[styles.detailDivider, { backgroundColor: theme.divider }]} />}
    </>
  );
}

// ─── Photo mosaic — fixed 2×2 grid, +N overlay on the 4th tile (Panel F) ──────
function PhotoMosaic({ photos, onOpen }: {
  photos: ReportPhoto[];
  onOpen: (photos: ReportPhoto[], index: number) => void;
}) {
  const theme = useTheme();
  const shown = photos.slice(0, 4);
  const overflow = photos.length - 4;

  return (
    <View style={styles.mosaic}>
      {shown.map((p, i) => {
        const isLastWithOverflow = i === 3 && overflow > 0;
        return (
          <Pressable
            key={p.id ?? i}
            onPress={() => onOpen(photos, i)}
            style={({ pressed }) => [
              styles.mosaicTile,
              { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Image source={{ uri: p.photo_url }} style={styles.mosaicImg} resizeMode="cover" />
            {isLastWithOverflow && (
              <View style={styles.mosaicOverflow}>
                <Text style={styles.mosaicOverflowText}>+{overflow}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Dense photo row — small square thumbs for history rounds (Panel G) ───────
function PhotoRowDense({ photos, onOpen }: {
  photos: ReportPhoto[];
  onOpen: (photos: ReportPhoto[], index: number) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.thumbRow}>
      {photos.map((p, i) => (
        <Pressable
          key={p.id ?? i}
          onPress={() => onOpen(photos, i)}
          style={({ pressed }) => [
            styles.thumb,
            { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Image source={{ uri: p.photo_url }} style={styles.mosaicImg} resizeMode="cover" />
        </Pressable>
      ))}
    </View>
  );
}

// ─── Collapsible text — clamps to N lines with inline Read more / Show less ────
function CollapsibleText({
  text,
  maxLines = 3,
  style,
}: {
  text: string;
  maxLines?: number;
  style?: object;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  return (
    <View>
      {/* Off-screen full render to measure true line count without numberOfLines clamping */}
      <Text
        style={[style, styles.measureLayer]}
        onTextLayout={(e) => setTruncated(e.nativeEvent.lines.length > maxLines)}
        accessible={false}
      >
        {text}
      </Text>
      {/* Text + fade gradient wrapper */}
      <View>
        <Text style={style} numberOfLines={expanded ? undefined : maxLines}>
          {text}
        </Text>
        {truncated && !expanded && (
          <LinearGradient
            colors={[`${theme.surface}00`, theme.surface]}
            style={styles.collapseFade}
            pointerEvents="none"
          />
        )}
      </View>
      {truncated && (
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.readMoreBtn} hitSlop={8}>
          <Text style={[styles.readMoreText, { color: theme.status.brand }]}>
            {expanded ? 'Show less' : 'Read more'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Findings block — status badges + text fields + photo mosaic (Panel E) ────
function FindingsBlock({
  report, photos, onOpenPhoto,
}: {
  report: TicketReportSummary;
  photos: ReportPhoto[];
  onOpenPhoto: (photos: ReportPhoto[], index: number) => void;
}) {
  const theme   = useTheme();
  const resolved  = report.issue_resolved;
  const hasStatus = resolved != null || !!report.severity;

  return (
    <View style={styles.findingsBlock}>
      {/* Resolution + severity */}
      {hasStatus && (
        <View style={styles.findingsStatus}>
          {resolved != null && (
            <View style={[
              styles.resolutionBadge,
              { backgroundColor: resolved ? palette.successSoft : palette.dangerSoft },
            ]}>
              <Icon
                name={resolved ? icons.success : icons.error}
                size={13}
                color={resolved ? theme.status.success : theme.status.danger}
              />
              <Text style={[
                styles.resolutionText,
                { color: resolved ? theme.status.success : theme.status.danger },
              ]}>
                {resolved ? 'Issue resolved' : 'Issue unresolved'}
              </Text>
            </View>
          )}
          {report.severity === 'high' && (
            <View style={[styles.resolutionBadge, { backgroundColor: palette.dangerSoft }]}>
              <Text style={[styles.resolutionText, { color: theme.status.danger }]}>High severity</Text>
            </View>
          )}
          {report.severity && report.severity !== 'high' && (
            <Text style={[styles.severityNote, { color: theme.textMuted }]}>
              {cap(report.severity)} severity
            </Text>
          )}
        </View>
      )}

      {/* Text fields */}
      {report.notes && (
        <FindingsField label="Field observations" value={report.notes} />
      )}
      {report.root_cause && (
        <FindingsField label="Root cause" value={report.root_cause} />
      )}
      {report.corrective_action && (
        <FindingsField label="Corrective action" value={report.corrective_action} />
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <View style={styles.findingsPhotos}>
          <Text style={[styles.fieldTitle, { color: theme.text }]}>Site photos</Text>
          <PhotoMosaic photos={photos} onOpen={onOpenPhoto} />
        </View>
      )}
    </View>
  );
}

function FindingsField({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.findingsField}>
      <Text style={[styles.fieldTitle, { color: theme.text }]}>{label}</Text>
      <CollapsibleText text={value} style={[styles.fieldValue, { color: theme.text }]} />
    </View>
  );
}

// ─── Timeline round — a node on the left track + a compact side card (Panel G) ─
// Replaces the old accordion. Each round is a feed entry: a status node sits on
// the continuous vertical track, anchoring a small secondary card to its right.
function TimelineRound({
  report, isLast, onOpenPhoto,
}: {
  report: TicketReportSummary;
  isLast: boolean;
  onOpenPhoto: (photos: ReportPhoto[], index: number) => void;
}) {
  const theme   = useTheme();
  const [open, setOpen] = useState(false);
  const rotate  = useSharedValue(0);
  const photos  = report.photos ?? [];

  const resolved    = report.issue_resolved;
  const accentColor = resolved === true
    ? theme.status.success
    : resolved === false
    ? theme.status.danger
    : theme.status.brand;

  const nodeFill = resolved === true
    ? theme.status.success
    : resolved === false
    ? theme.status.danger
    : theme.status.brand;

  const toggle = () => {
    rotate.value = withSpring(open ? 0 : 1, spring.snappy);
    setOpen((v) => !v);
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value * 180}deg` }],
  }));

  const roundLabel = `Round ${report.round ?? 1}`;
  const outcomeLabel = resolved === true ? 'Resolved' : resolved === false ? 'Unresolved' : 'Pending';

  return (
    <View style={styles.tlRow}>
      {/* Left track + node */}
      <View style={styles.tlTrackCol}>
        <View style={[styles.tlLine, { backgroundColor: theme.border }, isLast && styles.tlLineLast]} />
        <View style={[styles.tlNode, { backgroundColor: nodeFill, borderColor: theme.surfaceAlt }]}>
          <Icon
            name={resolved === false ? icons.error : icons.success}
            size={11}
            color={palette.white}
          />
        </View>
      </View>

      {/* Right side card */}
      <View style={[styles.tlCard, { backgroundColor: theme.surface, shadowColor: theme.shadow }, !isLast && styles.tlCardGap]}>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [styles.tlHeader, pressed && { backgroundColor: theme.surfaceMuted }]}
        >
          <View style={styles.tlHeaderLeft}>
            <Text style={[styles.tlRound, { color: theme.text }]}>{roundLabel}</Text>
            <View style={styles.tlOutcomeRow}>
              <View style={[styles.tlOutcomeDot, { backgroundColor: accentColor }]} />
              <Text style={[styles.tlOutcome, { color: accentColor }]}>{outcomeLabel}</Text>
            </View>
          </View>
          <View style={styles.tlHeaderRight}>
            <Text style={[styles.tlDate, { color: theme.textMuted }]}>{fmtDate(report.submitted_at)}</Text>
            <Animated.View style={chevronStyle}>
              <Icon name={icons.chevronDown} size={13} color={theme.textTertiary} />
            </Animated.View>
          </View>
        </Pressable>

        {/* Expanded content — compact, muted, distinct from active findings */}
        {open && (
          <View style={[styles.tlExpanded, { borderTopColor: theme.divider }]}>
            {report.notes ? <HistoryField label="Observations" value={report.notes} /> : null}
            {report.root_cause ? <HistoryField label="Root cause" value={report.root_cause} /> : null}
            {report.corrective_action ? <HistoryField label="Corrective action" value={report.corrective_action} /> : null}
            {report.follow_up_notes ? <HistoryField label="Follow-up note" value={report.follow_up_notes} /> : null}
            {photos.length > 0 && (
              <PhotoRowDense photos={photos} onOpen={onOpenPhoto} />
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// Compact, muted history text field — smaller footprint than active findings.
function HistoryField({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.histField}>
      <Text style={[styles.histLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.histValue, { color: theme.textSecondary }]}>{value}</Text>
    </View>
  );
}

// ─── Attachment row — doc icon | name + size | external action (Panel H) ──────
function AttachmentRow({ att, last }: { att: TicketAttachment; last?: boolean }) {
  const theme = useTheme();
  const kb = att.file_size ? Math.round(att.file_size / 1024) : null;
  return (
    <>
      <Pressable
        onPress={() => Linking.openURL(att.file_url)}
        style={({ pressed }) => [styles.attachRow, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.attachIconWrap, { backgroundColor: theme.surfaceAlt }]}>
          <Icon name={icons.attachment} size={16} color={theme.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.attachName, { color: theme.text }]} numberOfLines={1}>
            {att.file_name}
          </Text>
          {kb !== null && (
            <Text style={[styles.attachSize, { color: theme.textMuted }]}>{kb} KB</Text>
          )}
        </View>
        <Icon name={icons.external} size={15} color={theme.textTertiary} />
      </Pressable>
      {!last && <View style={[styles.detailDivider, { backgroundColor: theme.divider }]} />}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function TicketDetailContent({
  ticket,
  onOpenPhoto,
}: {
  ticket: MaintenanceTicket;
  onOpenPhoto: (photos: ReportPhoto[], index: number) => void;
}) {
  const theme = useTheme();

  const dbId = ticket._dbId ?? null;

  // Pull the authoritative full ticket (with all report rounds) from cache,
  // seeded by the ticket we were handed. The list endpoint omits `reports`, so
  // when opened from the bottom sheet the seed has none — this fills the history
  // timeline from the cached detail. Instant on reopen; fetches once otherwise.
  const { data: fullTicket } = useTicketDetail(dbId, ticket);
  const rounds: TicketReportSummary[] = fullTicket?.reports ?? ticket.reports ?? [];

  // Report / attachments / photos are cached by TanStack Query (memory-only,
  // 30-min retention). First open of a ticket fetches once; every reopen is
  // instant from cache with a silent background revalidate. Photos depend on
  // the resolved report id, so that query chains off `activeReport`.
  const { data: activeReport = null, isLoading: reportLoading } = useTicketReport(dbId);
  const { data: attachments = [] }   = useTicketAttachments(dbId);
  const { data: activePhotos = [] }  = useReportPhotos(activeReport?.id ?? null);

  const statusKey = ticket.dbStatus ?? 'assigned';
  const isHistory = ['pending_review', 'verified', 'cancelled'].includes(statusKey);
  const scheduled = ticket.scheduledTime ? fmtDate(ticket.scheduledTime) : null;

  const priorRounds = rounds
    .filter((r) => r.is_active === false)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));

  const detailRows: Array<{ icon: IconName; label: string; value: string }> = [];
  if (ticket.location)    detailRows.push({ icon: icons.station,     label: 'Station',     value: ticket.location });
  if (ticket.coordinates) detailRows.push({ icon: icons.coordinates, label: 'Coordinates', value: ticket.coordinates });
  if (scheduled)          detailRows.push({ icon: icons.calendar,    label: isHistory ? 'Completed' : 'Scheduled', value: scheduled });

  const hasFindings = activeReport && (
    activeReport.notes ||
    activeReport.root_cause ||
    activeReport.corrective_action ||
    activeReport.issue_resolved != null
  );

  const findingsRoundNum = activeReport?.round ?? 1;
  const analystNote = isHistory ? activeReport?.analyst_notes : null;

  return (
    <View style={styles.root}>

      {/* ── Panel A · Hero header & context ───────────────────────────────── */}
      <Panel>
        <Text style={[styles.title, { color: theme.text }]}>
          {ticket.title}
        </Text>
        <Text style={[styles.titleMeta, { color: theme.textMuted }]}>
          TKT-{ticket.ticketNumber}
          {ticket.anomalyZone ? `  ·  Zone ${ticket.anomalyZone}` : ''}
        </Text>
        <ChipsRow
          statusKey={statusKey}
          priority={ticket.priority ?? 'low'}
          anomalyZone={null}
        />
      </Panel>

      {/* ── Panel B · Conditional callout banners ─────────────────────────── */}
      {statusKey === 'cancelled' && (
        <Callout
          icon={icons.cancelled}
          accent={theme.status.neutral}
          tint={palette.neutralSoft}
          title="This ticket was cancelled"
          body={ticket.cancellationReason}
        />
      )}
      {ticket.isFollowUp && (
        <Callout
          icon={icons.followUp}
          accent={theme.status.warning}
          tint={palette.warningSoft}
          title={`Follow-up requested${(ticket.followUpCount ?? 0) > 1 ? ` · visit ${ticket.followUpCount}` : ''}`}
          body={ticket.followUpNotes}
        />
      )}

      {/* ── Panel C · Description block ────────────────────────────────────── */}
      {ticket.flaggedAnomaly ? (
        <Panel>
          <PanelLabel>Description</PanelLabel>
          <CollapsibleText text={ticket.flaggedAnomaly} style={[styles.descText, { color: theme.text }]} />
        </Panel>
      ) : null}

      {/* ── Panel D · Detail field list (station info) ─────────────────────── */}
      {detailRows.length > 0 && (
        <Panel style={styles.panelFlush}>
          {detailRows.map((row, i) => (
            <DetailRow
              key={row.label}
              icon={row.icon}
              label={row.label}
              value={row.value}
              last={i === detailRows.length - 1}
            />
          ))}
        </Panel>
      )}

      {/* Loading — only on the genuine first fetch (no cache yet); a cached
          reopen revalidates silently and never shows this. */}
      {reportLoading && !activeReport && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.textMuted} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading report…</Text>
        </View>
      )}

      {/* ── Panel E · Active inspection findings ───────────────────────────── */}
      {hasFindings && activeReport && (
        <Panel>
          <PanelLabel>
            {findingsRoundNum > 1
              ? `Inspection Findings · Round ${findingsRoundNum}`
              : 'Inspection Findings · Current Round'}
          </PanelLabel>
          <FindingsBlock report={activeReport} photos={activePhotos} onOpenPhoto={onOpenPhoto} />
        </Panel>
      )}

      {/* ── Panel F · Standalone photos when no other findings content ─────── */}
      {!hasFindings && activePhotos.length > 0 && (
        <Panel>
          <PanelLabel>Photos</PanelLabel>
          <PhotoMosaic photos={activePhotos} onOpen={onOpenPhoto} />
        </Panel>
      )}

      {/* ── Panel G · History — vertical timeline ──────────────────────────── */}
      {priorRounds.length > 0 && (
        <View>
          <PanelLabel>
            {`History · ${priorRounds.length} round${priorRounds.length > 1 ? 's' : ''}`}
          </PanelLabel>
          <View style={styles.timeline}>
            {priorRounds.map((r, i) => (
              <TimelineRound
                key={r.id}
                report={r}
                isLast={i === priorRounds.length - 1}
                onOpenPhoto={onOpenPhoto}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Panel H · Attachments ──────────────────────────────────────────── */}
      {attachments.length > 0 && (
        <Panel style={styles.panelFlush}>
          <View style={styles.panelFlushLabel}>
            <PanelLabel>{`Attachments · ${attachments.length}`}</PanelLabel>
          </View>
          {attachments.map((att, i) => (
            <AttachmentRow key={att.id} att={att} last={i === attachments.length - 1} />
          ))}
        </Panel>
      )}

      {/* ── Panel I · Analyst remarks ──────────────────────────────────────── */}
      {analystNote ? (
        <View style={[styles.remarkBlock, { backgroundColor: theme.surface, shadowColor: theme.shadow }]}>
          <Text style={[styles.remarkAuthor, { color: theme.text }]}>Analyst remarks</Text>
          <CollapsibleText text={analystNote} style={[styles.remarkText, { color: theme.text }]} />
        </View>
      ) : null}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // 16px horizontal screen padding · 24px gap between structural panels.
  root: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },

  // ── Panel — elevated white surface card ──────────────────────────────────────
  panel: {
    borderRadius: radius.lg - 2,   // 14
    padding: spacing.md,           // 16
    ...elevation.md,
  },
  // Flush panel: rows own their own padding, so the panel itself is unpadded.
  panelFlush: {
    padding: 0,
    overflow: 'hidden',
  },
  panelFlushLabel: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  panelLabel: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  // ── Panel A · Hero ───────────────────────────────────────────────────────────
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  titleMeta: {
    fontSize: typography.caption.size,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    lineHeight: typography.caption.lineHeight,
    marginTop: spacing.xxs,
  },

  // ── Chips ────────────────────────────────────────────────────────────────────
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  chipText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },

  // ── Panel B · Callout ────────────────────────────────────────────────────────
  callout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,   // 14
    borderRadius: radius.sm + 2, // 10
  },
  calloutTitle: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  calloutBody:  { fontSize: 14, lineHeight: 20, marginTop: 3 },

  // ── Panel C · Description (iOS prose) ────────────────────────────────────────
  descText: { fontSize: 16, lineHeight: 24 },

  // ── Panel D · Detail rows (settings-style block) ─────────────────────────────
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,   // 14 16
    gap: spacing.sm,
  },
  detailIcon:  { width: 18, flexShrink: 0 },
  detailLabel: { fontSize: 15, fontWeight: '500', flex: 1 },
  detailValue: { fontSize: 15, fontWeight: '700', textAlign: 'right', flexShrink: 1, maxWidth: '52%' },
  // Inset to align with the label text (past icon width + gap), not the icon edge.
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.md + 18 + spacing.sm,
  },

  // ── Panel E · Findings ───────────────────────────────────────────────────────
  findingsBlock: { gap: spacing.lg },
  findingsStatus: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  resolutionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  resolutionText: { fontSize: 13, fontWeight: '600' },
  severityNote:   { fontSize: 13, fontWeight: '500', alignSelf: 'center' },

  findingsField: { gap: 6 },
  fieldTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2, lineHeight: 18, textTransform: 'uppercase' },
  fieldValue: { fontSize: 16, lineHeight: 24 },
  findingsPhotos: { gap: spacing.xs },

  // ── Panel F · Photo mosaic (2×2) ─────────────────────────────────────────────
  mosaic: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PHOTO_GAP,
  },
  mosaicTile: {
    width: MOSAIC_TILE,
    height: MOSAIC_TILE,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  mosaicImg: { width: '100%', height: '100%' },
  mosaicOverflow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,39,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mosaicOverflowText: { color: palette.white, fontSize: 22, fontWeight: '700' },

  // Dense thumbs for history rounds.
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  thumb: {
    width: HISTORY_THUMB,
    height: HISTORY_THUMB,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },

  // ── Panel G · Vertical timeline ──────────────────────────────────────────────
  timeline: { marginTop: spacing.xxs },
  tlRow: { flexDirection: 'row' },
  tlTrackCol: {
    width: 32,
    alignItems: 'center',
  },
  tlLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
  // The last node's track stops at the node (no trailing line below it).
  tlLineLast: { bottom: undefined, height: 14 },
  tlNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    zIndex: 1,
  },
  tlCard: {
    flex: 1,
    borderRadius: radius.md,   // 12
    ...elevation.sm,
    overflow: 'hidden',
  },
  tlCardGap: { marginBottom: spacing.md },
  tlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  tlHeaderLeft: {
    flexDirection: 'column',
    gap: 3,
    flex: 1,
  },
  tlOutcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tlOutcomeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tlHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 0,
  },
  tlRound: { fontSize: 14, fontWeight: '700' },
  tlOutcome: { fontSize: 13, fontWeight: '600' },
  tlDate:  { fontSize: 12, fontWeight: '400' },
  tlExpanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: spacing.lg,
  },
  // Compact history fields — visually lighter than active findings.
  histField: { gap: 6 },
  histLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, textTransform: 'uppercase' },
  histValue: { fontSize: 14, lineHeight: 22 },

  // ── Panel H · Attachments ────────────────────────────────────────────────────
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  attachIconWrap: {
    width: 36, height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachName: { fontSize: 15, fontWeight: '500' },
  attachSize: { fontSize: 12, marginTop: 1 },

  // ── Loading ───────────────────────────────────────────────────────────────────
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  loadingText: { fontSize: 14, fontWeight: '400' },

  // ── CollapsibleText ───────────────────────────────────────────────────────────
  measureLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  collapseFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 52,
  },
  readMoreBtn: {
    marginTop: spacing.xxs,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Panel I · Analyst remarks — flat quote block ─────────────────────────────
  remarkBlock: {
    borderRadius: radius.lg - 2,
    padding: spacing.md,
    gap: spacing.xs,
    ...elevation.md,
  },
  remarkAuthor: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  remarkText: { fontSize: 15, lineHeight: 23 },
});
