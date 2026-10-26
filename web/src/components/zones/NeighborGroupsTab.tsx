"use client";

import { useState } from "react";
import { Compass } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { InfoTip } from "@/components/zones/InfoTip";
import type { NeighborInfo } from "@/types/zones";
import styles from "./NeighborGroupsTab.module.css";

interface NeighborGroupsTabProps {
  neighbors: Record<string, NeighborInfo[]>;
  selectedStationId?: string;
  onSelectStation?: (stationId: string) => void;
}

export function NeighborGroupsTab({ neighbors, selectedStationId, onSelectStation }: NeighborGroupsTabProps) {
  const [localStation, setLocalStation] = useState("");
  const stations = Object.keys(neighbors).sort((a, b) => a.localeCompare(b));
  const requested = selectedStationId ?? localStation;
  const selected = stations.includes(requested) ? requested : stations[0] ?? "";
  const nearby = [...(neighbors[selected] ?? [])].sort((a, b) => a.distance_km - b.distance_km);

  return <section className={styles.card} aria-label="Nearby stations">
    <h3><Compass size={15} aria-hidden="true" />Nearby stations
      <InfoTip label="About nearby stations" text={`Geographic neighbors from Zone B. Available comparisons can vary by reading date.${onSelectStation ? " On the map, blue outlines the selected station; muted outlines show its neighbors." : ""}`} />
    </h3>
    {stations.length ? <>
      <div className={styles.stationPicker}>
        <div className={styles.label}>Selected station</div>
        <Select value={selected} ariaLabel="Station to compare" width="100%"
        options={stations.map(id => ({ value: id, label: id }))}
        onChange={id => { setLocalStation(id); onSelectStation?.(id); }} />
      </div>
      <div className={`table-heading ${styles.listHeading}`}><span>Comparison station</span><span>Distance</span></div>
      {nearby.length ? <ul className={styles.list}>
        {nearby.map(neighbor => <li key={neighbor.neighbor_id}>
          <span>{neighbor.neighbor_id}</span>
          <span className={styles.distance}>{neighbor.distance_km.toFixed(2)}<span> km</span></span>
        </li>)}
      </ul> : <p className={styles.description}>No nearby comparison stations available for this station.</p>}
    </> : <p className={styles.description}>No nearby station data available for this run.</p>}
  </section>;
}
