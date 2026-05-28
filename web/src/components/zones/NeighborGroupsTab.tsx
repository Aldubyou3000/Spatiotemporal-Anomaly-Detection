"use client";

import { useMemo, useState } from "react";
import { Search, Compass } from "lucide-react";
import type { NeighborInfo } from "@/types/zones";

interface NeighborGroupsTabProps {
  neighbors: Record<string, NeighborInfo[]>;
}

export function NeighborGroupsTab({ neighbors }: NeighborGroupsTabProps) {
  const [query, setQuery] = useState("");

  const stations = useMemo(() => {
    return Object.entries(neighbors)
      .filter(([sid]) => !query.trim() || sid.toLowerCase().includes(query.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [neighbors, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 384 }}>
          <Search
            size={14}
            strokeWidth={2.2}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by station id…"
            style={{
              width: "100%", height: 40, paddingLeft: 36, paddingRight: 12,
              borderRadius: "var(--r-lg)",
              background: "var(--surface)", color: "var(--text)",
              fontSize: "var(--font-sm)",
              border: "1px solid var(--border-strong)",
              outline: "none",
              transition: "border-color 0.12s ease, box-shadow 0.12s ease",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--brand)";
              e.currentTarget.style.boxShadow = "0 0 0 4px var(--brand-soft)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-strong)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>
        <p style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {stations.length.toLocaleString()} stations
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {stations.map(([sid, list]) => (
          <div
            key={sid}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", padding: 20, boxShadow: "var(--shadow-sm)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ height: 28, width: 28, borderRadius: "var(--r-md)", background: "var(--brand-soft)", display: "grid", placeItems: "center" }}>
                <Compass size={13} strokeWidth={2.2} style={{ color: "var(--brand)" }} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>
                {sid}
              </span>
            </div>

            <ol style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
              {list.map((n, i) => (
                <li key={n.neighbor_id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text-tertiary)", width: 16, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-sm)", color: "var(--text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.neighbor_id}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "var(--font-xs)", color: "var(--text-secondary)", flexShrink: 0 }}>
                    {n.distance_km.toFixed(2)} km
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}

        {stations.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "64px 16px", color: "var(--text-tertiary)", fontSize: "var(--font-sm)" }}>
            No stations match the filter.
          </div>
        )}
      </div>
    </div>
  );
}
