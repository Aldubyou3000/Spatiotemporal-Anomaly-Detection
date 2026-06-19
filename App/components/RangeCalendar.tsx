/**
 * RangeCalendar — a compact, dependency-free month calendar with from–to range
 * selection. No react-native-calendars, no native date picker, so it runs in
 * Expo Go and a standalone APK with zero new deps. Fully themed.
 *
 * Navigation follows the Material 3 / Google Calendar standard: tap the
 * "June 2026" title to flip the body into a YEAR grid (then a MONTH grid), so any
 * year is reachable in one tap — solving the "I can't pick a year" problem.
 *
 * Selection: first tap = start, second tap = end (auto-ordered). Tapping after a
 * complete range starts fresh. Days compared by local Y-M-D, never timestamps.
 */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import Icon from '@/components/Icon';
import { Text } from '@/components/Themed';
import { icons } from '@/constants/icons';
import { palette, radius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export type DateRange = { start: Date | null; end: Date | null };

type Mode = 'days' | 'months' | 'years';

type Props = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

export default function RangeCalendar({ value, onChange }: Props) {
  const theme = useTheme();

  const [cursor, setCursor] = useState(() => dayStart(value.start ?? new Date()));
  const [mode, setMode] = useState<Mode>('days');

  const today = dayStart(new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, month]);

  // 12-year window around the current year for the year grid.
  const years = useMemo(() => {
    const base = year - 6;
    return Array.from({ length: 12 }, (_, i) => base + i);
  }, [year]);

  const inRange = (d: Date) => {
    const { start, end } = value;
    if (!start || !end) return false;
    const t = d.getTime();
    return t > start.getTime() && t < end.getTime();
  };

  const handleDayTap = (d: Date) => {
    const { start, end } = value;
    if (!start || (start && end)) { onChange({ start: d, end: null }); return; }
    if (d.getTime() < start.getTime()) onChange({ start: d, end: start });
    else onChange({ start, end: d });
  };

  const shiftMonth = (delta: number) => setCursor(new Date(year, month + delta, 1));
  const shiftYearWindow = (delta: number) => setCursor(new Date(year + delta, month, 1));

  // ── Header (tappable title flips modes) ────────────────────────────────────
  const headerLabel =
    mode === 'years' ? `${years[0]} – ${years[years.length - 1]}`
    : mode === 'months' ? `${year}`
    : `${MONTHS[month]} ${year}`;

  const stepLeft  = () => (mode === 'years' ? shiftYearWindow(-12) : mode === 'months' ? shiftYearWindow(-1) : shiftMonth(-1));
  const stepRight = () => (mode === 'years' ? shiftYearWindow(12) : mode === 'months' ? shiftYearWindow(1) : shiftMonth(1));

  return (
    <View>
      <View style={styles.navRow}>
        <Pressable
          onPress={stepLeft}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name={icons.chevronLeft} size={18} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          onPress={() => setMode((m) => (m === 'days' ? 'years' : m === 'years' ? 'months' : 'days'))}
          hitSlop={8}
          style={({ pressed }) => [styles.titleBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.monthLabel, { color: theme.text }]}>{headerLabel}</Text>
          <Icon name={mode === 'days' ? icons.chevronDown : icons.chevronUp} size={16} color={theme.textSecondary} />
        </Pressable>

        <Pressable
          onPress={stepRight}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, { backgroundColor: theme.surfaceAlt, opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name={icons.chevronRight} size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* ── YEAR grid ── */}
      {mode === 'years' && (
        <View style={styles.gridWrap}>
          {years.map((y) => {
            const selected = y === year;
            return (
              <Pressable
                key={y}
                onPress={() => { setCursor(new Date(y, month, 1)); setMode('months'); }}
                style={({ pressed }) => [
                  styles.chipCell,
                  selected && { backgroundColor: palette.brand },
                  pressed && !selected && { backgroundColor: theme.surfaceMuted },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text }]}>{y}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── MONTH grid ── */}
      {mode === 'months' && (
        <View style={styles.gridWrap}>
          {MONTHS_SHORT.map((m, i) => {
            const selected = i === month;
            return (
              <Pressable
                key={m}
                onPress={() => { setCursor(new Date(year, i, 1)); setMode('days'); }}
                style={({ pressed }) => [
                  styles.chipCell,
                  selected && { backgroundColor: palette.brand },
                  pressed && !selected && { backgroundColor: theme.surfaceMuted },
                ]}
              >
                <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.text }]}>{m}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* ── DAY grid ── */}
      {mode === 'days' && (
        <>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <View key={i} style={styles.cell}>
                <Text style={[styles.weekday, { color: theme.textTertiary }]}>{w}</Text>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.cell} />;
              const isStart = value.start && sameDay(d, value.start);
              const isEnd = value.end && sameDay(d, value.end);
              const isEndpoint = isStart || isEnd;
              const isMid = inRange(d);
              const isToday = sameDay(d, today);
              const hasRange = value.start && value.end;

              return (
                <View key={i} style={styles.cell}>
                  {(isMid || (isEndpoint && hasRange)) && (
                    <View
                      style={[
                        styles.rangeBand,
                        { backgroundColor: palette.brandSoft },
                        isStart && hasRange && styles.bandStart,
                        isEnd && hasRange && styles.bandEnd,
                      ]}
                    />
                  )}
                  <Pressable
                    onPress={() => handleDayTap(d)}
                    style={({ pressed }) => [
                      styles.day,
                      isEndpoint && { backgroundColor: palette.brand },
                      pressed && !isEndpoint && { backgroundColor: theme.surfaceMuted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        { color: isEndpoint ? '#FFFFFF' : theme.text },
                        isToday && !isEndpoint && { color: palette.brand, fontWeight: '800' },
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const CELL = 42;

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navBtn: {
    width: 34, height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  monthLabel: {
    fontSize: typography.bodyBold.size,
    lineHeight: typography.bodyBold.lineHeight,
    fontWeight: '700',
  },
  weekRow: { flexDirection: 'row', marginBottom: spacing.xxs },
  weekday: { fontSize: typography.caption.size, fontWeight: '700', letterSpacing: 0.3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeBand: { position: 'absolute', left: 0, right: 0, top: 5, bottom: 5 },
  bandStart: { left: '50%' },
  bandEnd: { right: '50%' },
  day: {
    width: 36, height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: typography.callout.size, fontWeight: '500' },

  // Year / month grids — 3 columns of pill cells.
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chipCell: {
    width: `${100 / 3}%`,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  chipText: { fontSize: typography.body.size, fontWeight: '600' },
});
