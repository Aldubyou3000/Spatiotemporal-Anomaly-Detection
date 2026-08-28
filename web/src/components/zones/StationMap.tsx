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
  /** Same intensity that colors the Gauge Reliability badges — keeps map + card in sync. */
  gaugeStatus?: GaugeStatus;
}

interface StationMapProps {
  stations: StationPoint[];
  className?: string;
  height?: number;
}

const LIGHT_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DARK_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://www.esri.com/">Esri</a>';

export function StationMap({ stations, className, height = 480 }: StationMapProps) {
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

    return () => {
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
      // Gauge health stays in the popup as secondary context (dot + text), not the dot fill.
      const status = (station as { gaugeStatus?: GaugeStatus }).gaugeStatus ?? null;
      const baseColor = isAnomalous ? getCssVar("--danger") || "#DC2626" : getCssVar("--success") || "#16A34A";

      if (isAnomalous) {
        const halo = L.circleMarker([station.latitude, station.longitude], {
          radius: 14,
          fillColor: baseColor,
          fillOpacity: 0.13,
          color: "transparent",
          weight: 0,
          interactive: false,
        }).addTo(map);
        markersRef.current.push(halo);
      }

      const marker = L.circleMarker([station.latitude, station.longitude], {
        radius: isAnomalous ? 8 : 6,
        // White stroke keeps the dot crisp on both Voyager blues and dark tiles,
        // while the solid fill carries the semantic color.
        color: "#ffffff",
        weight: 2,
        fillColor: baseColor,
        fillOpacity: isAnomalous ? 0.96 : 0.88,
      }).addTo(map);

      const gaugeLabel = status === "suspect" ? "Gauge needs check" : status === "watch" ? "Gauge watch" : status === "consistent" ? "Gauge normal" : status === "need_more" ? "Gauge — need more rain" : "—";
      const gaugeDesc = status === "suspect" ? "repeated bias vs neighbors" : status === "watch" ? "a bit off vs neighbors" : status === "consistent" ? "tracks neighbors" : "";
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

      marker.bindTooltip(station.station_id, {
        permanent: true,
        direction: "top",
        offset: L.point(0, isAnomalous ? -12 : -9),
        className: "station-label",
      });

      markersRef.current.push(marker);
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

  return (
    <div style={{ isolation: "isolate" }}>
      <div
        ref={containerRef}
        className={className}
        style={{ height, borderRadius: 12, overflow: "hidden" }}
      />
    </div>
  );
}

function getCssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
