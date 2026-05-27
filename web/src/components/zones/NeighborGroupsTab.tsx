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
    <div className="space-y-4 pt-6">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search
            size={14}
            strokeWidth={2.2}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by station id…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface text-text text-[14px] border border-border-strong placeholder:text-text-tertiary focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft transition"
          />
        </div>
        <p className="text-[12px] text-text-secondary font-mono tabular shrink-0">
          {stations.length.toLocaleString()} stations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stations.map(([sid, list]) => (
          <div
            key={sid}
            className="bg-surface border border-border rounded-xl p-5"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-md bg-brand-soft grid place-items-center">
                <Compass size={13} className="text-brand" strokeWidth={2.2} />
              </div>
              <span className="font-mono tabular text-[14px] font-semibold text-text">
                {sid}
              </span>
            </div>

            <ol className="space-y-2">
              {list.map((n, i) => (
                <li key={n.neighbor_id} className="flex items-center gap-3">
                  <span className="font-mono tabular text-[10px] text-text-tertiary w-4 shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-mono tabular text-[13px] text-text flex-1 truncate">
                    {n.neighbor_id}
                  </span>
                  <span className="font-mono tabular text-[12px] text-text-secondary tabular shrink-0">
                    {n.distance_km.toFixed(2)} km
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}

        {stations.length === 0 && (
          <div className="col-span-full text-center py-16 text-text-tertiary text-[13px]">
            No stations match the filter.
          </div>
        )}
      </div>
    </div>
  );
}
