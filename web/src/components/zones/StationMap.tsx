"use client";

import { useEffect, useMemo, useRef } from "react";
import L, { type Map as LeafletMap, type CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "@/context/ThemeContext";

interface StationPoint {
  station_id: string;
  latitude: number;
  longitude: number;
  anomaly_count: number;
  total_readings: number;
}

interface StationMapProps {
  stations: StationPoint[];
  className?: string;
  height?: number;
}

const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

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

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (stations.length === 0) return;

    const bounds = L.latLngBounds([]);
    stations.forEach((station) => {
      const isAnomalous = station.anomaly_count > 0;
      const color = isAnomalous
        ? getCssVar("--danger") || "#E53535"
        : getCssVar("--success") || "#0DB976";
      const fill = isAnomalous
        ? getCssVar("--danger") || "#E53535"
        : getCssVar("--success") || "#0DB976";

      const marker = L.circleMarker([station.latitude, station.longitude], {
        radius: isAnomalous ? 9 : 6,
        color,
        weight: 2,
        fillColor: fill,
        fillOpacity: isAnomalous ? 0.55 : 0.35,
      }).addTo(map);

      marker.bindPopup(
        `<div style="font-family: var(--font-geist, system-ui); padding: 4px 2px; min-width: 200px;">
           <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary);">Station</div>
           <div style="font-family: var(--font-jetbrains, ui-monospace); font-size: 14px; font-weight: 600; color: var(--text);">${station.station_id}</div>
           <div style="margin-top: 8px; display: flex; gap: 12px;">
             <div>
               <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em;">Readings</div>
               <div style="font-family: var(--font-jetbrains, ui-monospace); font-size: 14px; color: var(--text);">${station.total_readings}</div>
             </div>
             <div>
               <div style="font-size: 10px; color: ${isAnomalous ? "var(--danger)" : "var(--text-secondary)"}; text-transform: uppercase; letter-spacing: 0.06em;">Anomalies</div>
               <div style="font-family: var(--font-jetbrains, ui-monospace); font-size: 14px; color: ${isAnomalous ? "var(--danger)" : "var(--text)"};">${station.anomaly_count}</div>
             </div>
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
        offset: L.point(0, isAnomalous ? -11 : -8),
        className: "station-label",
      });

      markersRef.current.push(marker);
      bounds.extend([station.latitude, station.longitude]);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });

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
