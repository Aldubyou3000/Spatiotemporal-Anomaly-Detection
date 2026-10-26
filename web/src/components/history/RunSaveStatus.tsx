"use client";

import Link from "next/link";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ProcessResult } from "@/types/zones";
import styles from "./History.module.css";

export function RunSaveStatus({ result, onSave, compact = false }: { result: ProcessResult; onSave: () => void; compact?: boolean }) {
  if (compact) return <div className={styles.compactSaveStatus}>
    {result.history_saved && result.run_id ? <Link href={`/history/${result.run_id}`} title={result.history_title || "View saved run"}>{result.history_title || "Saved run"} →</Link>
      : <><span className="sr-only">Not saved</span><Button size="sm" variant="primary" onClick={onSave} disabled={!result.run_id}><Save size={13} /> Save to History</Button></>}
  </div>;
  if (result.history_saved && result.run_id) return <div className={styles.saveStatus}>
    <span>Saved{result.history_title ? <> · <strong>{result.history_title}</strong></> : " to History"}</span><Link href={`/history/${result.run_id}`}>View saved run →</Link>
  </div>;
  return <div className={styles.saveStatus}>
    <span>Not saved · Save to keep this run and record reviews.</span>
    <Button size="sm" variant="primary" onClick={onSave} disabled={!result.run_id}><Save size={13} /> Save to History</Button>
  </div>;
}
