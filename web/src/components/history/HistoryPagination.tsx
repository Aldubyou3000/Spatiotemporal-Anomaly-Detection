import { Button } from "@/components/ui/Button";
import styles from "./History.module.css";

export function HistoryPagination({ total, offset, onChange }: { total: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= 20 && offset === 0) return null;
  return <div className={styles.footer}>
    <span>{total ? `${offset + 1}–${Math.min(offset + 20, total)} of ${total}` : "No records"}</span>
    <div className={styles.actions}>
      <Button size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - 20))}>Previous</Button>
      <Button size="sm" disabled={offset + 20 >= total} onClick={() => onChange(offset + 20)}>Next</Button>
    </div>
  </div>;
}
