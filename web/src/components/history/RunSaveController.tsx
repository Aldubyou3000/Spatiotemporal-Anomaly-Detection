"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useZones } from "@/context/ZonesContext";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useSaveHistoryRun } from "@/hooks/useHistory";

function SaveRunModal({ initialTitle, saving, error, onSave, onClose }: {
  initialTitle: string; saving: boolean; error: string | null; onSave: (title: string) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle.slice(0, 120));
  return <Modal title="Save to History" onClose={saving ? () => {} : onClose}>
    <form onSubmit={(event) => { event.preventDefault(); if (title.trim() && !saving) onSave(title.trim()); }}>
      <div style={{ padding: "var(--pad-y) var(--pad-x)" }}>
        <Input id="history-run-title" label="Title" autoFocus required maxLength={120} value={title} disabled={saving}
          onChange={(event) => setTitle(event.target.value)} placeholder="e.g. October rainfall review" />
        {error && <p role="alert" style={{ color: "var(--danger-on)", fontSize: "var(--font-sm)", marginTop: 12 }}>{error}</p>}
      </div>
      <ModalFooter>
        <Button type="button" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!title.trim()} loading={saving}>Save to History</Button>
      </ModalFooter>
    </form>
  </Modal>;
}

export function RunSaveController() {
  const { result, files, setResult, resetSession, saveRequest, requestSave, cancelSave, leaveRequest, guardUnsaved, cancelLeave } = useZones();
  const { save, saving, error, clearError } = useSaveHistoryRun();
  const router = useRouter();
  const toast = useToast();
  const activeRun = useRef(result?.run_id);
  activeRun.current = result?.run_id;
  useEffect(() => { clearError(); }, [saveRequest, clearError]);

  useEffect(() => {
    if (!result || result.history_saved) return;
    function onLink(event: MouseEvent) {
      if (window.location.pathname !== "/zones") return;
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || link.target && link.target !== "_self") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      const withinWorkspace = /^\/(zones|history|tickets|reports|technicians|audit)(\/|$)/.test(url.pathname);
      guardUnsaved(() => {
        if (!withinWorkspace) resetSession();
        router.push(`${url.pathname}${url.search}${url.hash}`);
      }, { allowContinue: withinWorkspace });
    }
    document.addEventListener("click", onLink, true);
    return () => document.removeEventListener("click", onLink, true);
  }, [result, guardUnsaved, resetSession, router]);

  async function saveCurrent(title: string) {
    if (!result?.run_id) return;
    const id = result.run_id;
    const afterSave = saveRequest?.afterSave;
    try {
      const saved = await save(id, title);
      if (activeRun.current !== id) return;
      setResult(saved, id); cancelSave();
      toast.success("Saved to History", { description: saved.history_title ?? title });
      afterSave?.(saved);
    } catch { /* The modal retains the title and displays the save error. */ }
  }

  return <>
    {leaveRequest && <ConfirmDialog title="Save this run?"
      message={leaveRequest.allowContinue
        ? "Your run stays in Zones for this session. Save it to History to keep it."
        : "Continuing will discard this unsaved run."}
      cancelLabel="Cancel" confirmLabel={leaveRequest.allowContinue ? "Don’t save" : "Discard"} isDangerous={!leaveRequest.allowContinue} onCancel={cancelLeave}
      onConfirm={() => { const proceed = leaveRequest.proceed; cancelLeave(); proceed(); }}
      extraAction={<Button variant="primary" onClick={() => {
        const proceed = leaveRequest.proceed; cancelLeave(); requestSave(proceed);
      }}>Save</Button>} />}
    {saveRequest && result && <SaveRunModal key={result.run_id ?? result.processed_at}
      initialTitle={files[0]?.name.replace(/\.csv$/i, "") || `Rainfall review ${result.summary.date_range_start ?? result.processed_at.slice(0, 10)}`}
      saving={saving} error={error} onSave={(title) => void saveCurrent(title)} onClose={cancelSave} />}
  </>;
}
