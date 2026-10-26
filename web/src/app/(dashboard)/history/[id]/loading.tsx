import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import styles from "@/components/history/History.module.css";

export default function HistoryLoading() {
  return <div className={styles.page}>
    <Header title="Saved run" parent={<Link href="/history">History</Link>} />
    <div className={`dashboard-content ${styles.body}`}>
      <div className={styles.empty} role="status">Opening saved run…</div>
    </div>
  </div>;
}
