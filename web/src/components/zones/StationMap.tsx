"use client";

import { useEffect, useMemo, useRef } from "react";
import L, { type Map as LeafletMap, type CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/context/ThemeContext";

type GaugeStatus = "suspect" | "watch" | "consistent" | "need_more" | null;

interface StationPoint {
  station_id: string;
  latitude: number;
  longitude: number;
  anomaly_count: number;
  total_readings: number;
  /** Same intensity that colors the Sensor Reliability badges — keeps map + card in sync. */
  gaugeStatus?: GaugeStatus;
}

interface StationMapProps {
  stations: StationPoint[];
  className?: string;
  height?: number | string;
  style?: React.CSSProperties;
}

const LIGHT_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.esri.com/">Esri</a>';

export function StationMap({ stations, className, height = 480, style }: StationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);
  const { theme } = useTheme();

  const center = useMemo<[number, number]>(() => {
    if (stations.length === 0) return [12.5, 122.5]; // Philippines centroid as fallback
    const lat = stations.reduce((sum, s) => sum + s.latitude, 0) / stations.length;
    const lon = stations.reduce((sum, s) => sum + s.longitude, 0) / stations.length;
    return [lat, lon];
  }, [stations]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom: 7,
      scrollWheelZoom: true,
      zoomControl: true,
      attributionControl: true,
    });

    tilesRef.current = L.tileLayer(theme === "dark" ? DARK_TILES : LIGHT_TILES, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Keep Leaflet in sync when the flex container resizes (map now stretches to
    // match the right-hand stats stack). Without this, Leaflet keeps the old 0×0
    // or 400px measurement and tiles appear clipped.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => {
        requestAnimationFrame(() => map.invalidateSize({ animate: false }));
      });
      ro.observe(containerRef.current);
    }

    return () => {
      if (ro) ro.disconnect();
      map.remove();
      mapRef.current = null;
      tilesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap tiles when theme changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (tilesRef.current) tilesRef.current.remove();
    tilesRef.current = L.tileLayer(theme === "dark" ? DARK_TILES : LIGHT_TILES, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
    }).addTo(mapRef.current);
  }, [theme]);

  // Render markers and lock viewport to station bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Tab was hidden (display:none) while another tab was active — Leaflet measured
    // 0×0 then. Invalidate so the map picks up the real container size before we
    // place markers / fitBounds, otherwise markers balloon and tiles swim.
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (stations.length === 0) return;

    const bounds = L.latLngBounds([]);
    stations.forEach((station) => {
      const isAnomalous = station.anomaly_count > 0;
      // Map is anomaly-first: dot color = flagged vs typical.
      // Sensor reliability stays in the popup as secondary context (dot + text), not the dot fill.
      const status = (station as { gaugeStatus?: GaugeStatus }).gaugeStatus ?? null;
      const baseColor = isAnomalous ? getCssVar("--danger") || "#DC2626" : getCssVar("--success") || "#16A34A";

      if (isAnomalous) {
        // Outer faint ring — makes flagged visible even at zoom 7
        const outer = L.circleMarker([station.latitude, station.longitude], {
          radius: 20,
          fillColor: baseColor,
          fillOpacity: 0.07,
          color: baseColor,
          weight: 1,
          opacity: 0.18,
          interactive: false,
        }).addTo(map);
        markersRef.current.push(outer);
        const halo = L.circleMarker([station.latitude, station.longitude], {
          radius: 14,
          fillColor: baseColor,
          fillOpacity: 0.22,
          color: baseColor,
          weight: 1,
          opacity: 0.25,
          interactive: false,
        }).addTo(map);
        markersRef.current.push(halo);
      }

      const marker = L.circleMarker([station.latitude, station.longitude], {
        radius: isAnomalous ? 10 : 5,
        // White stroke keeps the dot crisp; flagged gets thicker stroke and full opacity
        color: "#ffffff",
        weight: isAnomalous ? 3 : 2,
        fillColor: baseColor,
        fillOpacity: isAnomalous ? 1 : 0.62,
      }).addTo(map);

      const gaugeLabel = status === "suspect" ? "Sensor needs attention" : status === "watch" ? "Monitor sensor" : status === "consistent" ? "Sensor reliable" : status === "need_more" ? "Not enough data" : "—";
      const gaugeDesc = status === "suspect" ? "often much higher or often no reading vs neighbors" : status === "watch" ? "a bit off vs neighbors" : status === "consistent" ? "matches neighbors over time" : "";
      const statusHue: Record<NonNullable<GaugeStatus>, string> = {
        suspect: getCssVar("--danger") || "#DC2626",
        watch: getCssVar("--warning") || "#D97706",
        consistent: getCssVar("--success") || "#16A34A",
        need_more: getCssVar("--text-tertiary") || "#A1A9B4",
      };
      const gaugeTint = status ? statusHue[status] : getCssVar("--text-tertiary") || "#6B7280";
      marker.bindPopup(
        `<div style="font-family: var(--font-geist, system-ui); padding: 6px 4px; min-width: 230px;">
            <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary);">Station</div>
            <div style="font-family: var(--font-jetbrains, ui-monospace); font-size: 14px; font-weight: 700; color: var(--text);">${station.station_id}</div>
            <div style="margin-top: 10px; display: flex; gap: 14px; align-items: flex-end;">
              <div>
                <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em;">Readings</div>
                <div style="font-family: var(--font-jetbrains, ui-monospace); font-size: 14px; font-weight: 600; color: var(--text);">${station.total_readings}</div>
              </div>
              <div>
                <div style="font-size: 10px; color: ${isAnomalous ? "var(--danger)" : "var(--text-secondary)"}; text-transform: uppercase; letter-spacing: 0.06em;">Flagged days</div>
                <div style="font-family: var(--font-jetbrains, ui-monospace); font-size: 14px; font-weight: 700; color: ${isAnomalous ? "var(--danger)" : "var(--text)"};">${station.anomaly_count}</div>
              </div>
            </div>
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--divider); display: flex; align-items: center; gap: 6px;">
              <span style="width:7px;height:7px;border-radius:99px;background:${gaugeTint};flex-shrink:0;display:inline-block;"></span>
              <span style="font-size: 11px; font-weight: 600; color: ${gaugeTint};">${gaugeLabel}</span>
              ${gaugeDesc ? `<span style="font-size: 11px; color: var(--text-secondary);">· ${gaugeDesc}</span>` : ``}
            </div>
          </div>`,
        {
          autoPan: true,
          autoPanPaddingTopLeft: L.point(20, 20),
          autoPanPaddingBottomRight: L.point(20, 20),
          keepInView: true,
        }
      );

      const label = isAnomalous ? `${station.station_id} • ${station.anomaly_count}` : station.station_id;
      marker.bindTooltip(label, {
        permanent: true,
        direction: "top",
        offset: L.point(0, isAnomalous ? -14 : -9),
        className: isAnomalous ? "station-label station-label--flagged" : "station-label",
      });

      markersRef.current.push(marker);
      if (isAnomalous) marker.bringToFront();
      bounds.extend([station.latitude, station.longitude]);
    });

    if (bounds.isValid()) {
      // No fly/animate on tab switch — the TabPanel already fades; second motion stacks and feels exaggerated.
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11, animate: false } as L.FitBoundsOptions);

      // Lock zoom-out to the level that shows all stations, and pan to those bounds
      const fitZoom = map.getBoundsZoom(bounds, false, [40, 40] as unknown as L.Point);
      map.setMinZoom(fitZoom);
      map.setMaxBounds(bounds.pad(0.3));
    }
  }, [stations]);

  const isFlexible = typeof height === "string" && height.includes("%");
  return (
    <div style={{ isolation: "isolate", ...(isFlexible ? { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } : undefined), ...style }}>
      <div
        ref={containerRef}
        className={className}
        style={{ height, ...(isFlexible ? { flex: 1, minHeight: 380 } : undefined), borderRadius: 12, overflow: "hidden" }}
      />
    </div>
  );
}

function getCssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
