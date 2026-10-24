"use client";

import Link from "next/link";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ProcessResult } from "@/types/zones";
import styles from "./History.module.css";

export function RunSaveStatus({ result, onSave }: { result: ProcessResult; onSave: () => void }) {
  if (result.history_saved && result.run_id) return <div className={styles.saveStatus}>
    <span>Saved{result.history_title ? <> · <strong>{result.history_title}</strong></> : " to History"}</span><Link href={`/history/${result.run_id}`}>View saved run →</Link>
  </div>;
  return <div className={styles.saveStatus}>
    <span>Not saved · Save to keep this run and record reviews.</span>
    <Button size="sm" variant="primary" onClick={onSave} disabled={!result.run_id}><Save size={13} /> Save to History</Button>
  </div>;
}
