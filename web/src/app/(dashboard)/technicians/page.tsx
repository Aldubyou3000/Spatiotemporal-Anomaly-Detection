"use client";

import { useMemo, useState } from "react";
import { useTechnicianProfiles, useTicketTechnicians } from "@/hooks/useTechnicians";
import {
  AlertTriangle,
  Mail,
  Phone,
  Plus,
  Search,
  Send,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { TechnicianWorkloadBadge } from "@/components/tickets/TechnicianWorkloadBadge";
import { techniciansApi } from "@/lib/api/technicians";
import type { TechnicianCreate, TechnicianProfile } from "@/types/technicians";
import type { Technician } from "@/types/tickets";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "brand";
}) {
  const iconBg =
    tone === "success" ? "color-mix(in oklab, var(--success) 12%, transparent)" :
    tone === "brand"   ? "var(--brand-soft)" :
    "var(--surface-sunken)";
  const iconColor =
    tone === "success" ? "var(--success)" :
    tone === "brand"   ? "var(--brand)" :
    "var(--text-muted)";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-xl)",
        padding: "16px 20px",
        boxShadow: "var(--shadow-xs)",
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "var(--r-md)",
          background: iconBg,
          color: iconColor,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: "var(--font-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 4px" }}>
          {label}
        </p>
        <p style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Create Technician Modal ──────────────────────────────────────────────────

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: TechnicianProfile) => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Live mismatch hint — only after the user has started typing the confirmation.
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  /** Validate the form; on success open the confirmation dialog (no API call yet). */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !username.trim() || !email.trim() || !password.trim()) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError("");
    setConfirmOpen(true);
  }

  /** Confirmed — actually create the account. */
  async function commitCreate() {
    setConfirmOpen(false);
    setSaving(true);
    setError("");
    const body: TechnicianCreate = {
      full_name: fullName.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password,
      phone: phone.trim() || undefined,
    };
    try {
      const technician = await techniciansApi.create(body);
      toast.success("Technician account created", {
        description: `${technician.full_name} (@${technician.username}) can now sign in via the mobile app.`,
      });
      onCreated(technician);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create account.";
      setError(msg);
      toast.error("Couldn't create account", { description: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New Technician Account"
      subtitle="The technician can log in immediately via the mobile app."
      onClose={!saving ? onClose : undefined as unknown as () => void}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Santos"
            required
            autoFocus
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="jsantos"
              autoComplete="off"
              required
            />
            <Input
              label="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+63 9xx xxx xxxx"
            />
          </div>

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            required
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input
              label="Temporary Password"
              type="password"
              passwordToggle
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              hint="At least 8 characters."
              error={password.length > 0 && password.length < 8 ? "Too short" : undefined}
              required
            />
            <Input
              label="Confirm Password"
              type="password"
              passwordToggle
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              error={passwordMismatch ? "Doesn't match" : undefined}
              required
            />
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: "var(--r-md)", background: "var(--danger-soft)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <AlertTriangle size={13} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} strokeWidth={2.4} />
              <p style={{ fontSize: "var(--font-sm)", color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          )}
        </div>

        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={saving || passwordMismatch}>
            <Send size={13} strokeWidth={2.2} />
            {saving ? "Creating…" : "Create Account"}
          </Button>
        </ModalFooter>
      </form>

      {confirmOpen && (
        <ConfirmDialog
          title="Create this technician account?"
          message={
            <>
              An account for <strong style={{ color: "var(--text)" }}>{fullName.trim()}</strong> (
              <span style={{ fontFamily: "var(--font-mono)" }}>@{username.trim().toLowerCase()}</span>) will be created and
              can sign in immediately with the temporary password you set. Make sure the email{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>{email.trim().toLowerCase()}</span> is correct.
            </>
          }
          confirmLabel="Create account"
          onConfirm={commitCreate}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </Modal>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function TechRow({ technician, workload }: { technician: TechnicianProfile; workload?: Technician }) {
  const [hovered, setHovered] = useState(false);
  const inits = initials(technician.full_name);

  return (
    <tr
      style={{
        background: hovered ? "var(--surface-sunken)" : "transparent",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Account */}
      <td style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--brand) 0%, #5B9FE8 100%)",
              color: "white",
              display: "grid",
              placeItems: "center",
              fontSize: "var(--font-xs)",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {inits}
          </div>
          <div style={{ lineHeight: 1.3, minWidth: 0 }}>
            <div style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text)" }}>
              {technician.full_name}
            </div>
            <div style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              @{technician.username}
            </div>
          </div>
        </div>
      </td>

      {/* Email / Phone */}
      <td style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-sm)", color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-muted)" }}><Mail size={12} strokeWidth={2} /></span>
          {technician.email}
        </div>
        {technician.phone && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-xs)", color: "var(--text-muted)", marginTop: 2 }}>
            <Phone size={11} strokeWidth={2} />
            {technician.phone}
          </div>
        )}
      </td>

      {/* Active Load */}
      <td style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        {workload ? (
          <TechnicianWorkloadBadge tech={workload} showBreakdown align="start" />
        ) : (
          <span style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)" }}>—</span>
        )}
      </td>

      {/* Status */}
      <td style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        <Badge tone={technician.is_active ? "success" : "neutral"} dot>
          {technician.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>

      {/* Joined */}
      <td style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)", fontSize: "var(--font-sm)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        {fmt(technician.created_at)}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TechniciansPage() {
  const { loading: authLoading } = useAuth();
  const { technicians, isLoading: loading, error: fetchError, mutate } = useTechnicianProfiles();
  // Active workload is computed on the ticket-technicians endpoint; merge by id.
  // (Ticket mutations already revalidate this key via the SSE `tickets` matcher.)
  const { technicians: workloadList } = useTicketTechnicians();
  const workloadById = useMemo(
    () => new Map<string, Technician>(workloadList.map((t) => [t.id, t])),
    [workloadList],
  );
  const error = fetchError?.message ?? null;
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");

  function handleCreated(t: TechnicianProfile) {
    setShowCreate(false);
    mutate((cur) => (cur ? [t, ...cur] : [t]), { revalidate: true });
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return technicians;
    const q = query.toLowerCase();
    return technicians.filter(
      (t) =>
        t.full_name.toLowerCase().includes(q) ||
        t.username.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q)
    );
  }, [technicians, query]);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-sm)", fontFamily: "var(--font-mono)" }}>Loading session…</p>
      </div>
    );
  }

  const activeCount = technicians.filter((t) => t.is_active).length;

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <Header
        title="Technicians"
        description={`${activeCount} active · ${technicians.length} total`}
        live
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} strokeWidth={2.4} />
            New Technician
          </Button>
        }
      />

      <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, maxWidth: 560 }}>
          <StatCard label="Active" value={activeCount} icon={<Users size={15} />} tone="success" />
          <StatCard label="Total Accounts" value={technicians.length} icon={<Users size={15} />} tone="brand" />
        </div>

        {/* Table card */}
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-xl)",
            boxShadow: "var(--shadow-xs)",
            overflow: "hidden",
          }}
        >
          {/* Card header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>Field Team</h3>
              <span
                style={{
                  height: 20,
                  padding: "0 6px",
                  borderRadius: "var(--r-full)",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border)",
                  fontSize: "var(--font-xs)",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  display: "inline-grid",
                  placeItems: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {filtered.length}
              </span>
            </div>
            {/* Search */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", width: 240 }}>
              <Search
                size={13}
                style={{ position: "absolute", left: 10, color: "var(--text-muted)", pointerEvents: "none" }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search technicians…"
                style={{
                  width: "100%",
                  height: 30,
                  paddingLeft: 30,
                  paddingRight: 10,
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border)",
                  background: "var(--surface-alt)",
                  color: "var(--text)",
                  fontSize: "var(--font-sm)",
                  outline: "none",
                  fontFamily: "inherit",
                  transition: "border-color 0.12s ease",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
            </div>
          </div>

          {/* Table body */}
          {loading ? (
            <div style={{ padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  border: "2px solid var(--border)",
                  borderTopColor: "var(--brand)",
                  animation: "spin 700ms linear infinite",
                }}
              />
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", margin: 0 }}>Loading technicians…</p>
            </div>
          ) : error ? (
            <div style={{ padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={20} style={{ color: "var(--danger)" }} strokeWidth={2} />
              <p style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text)", margin: 0 }}>Failed to load</p>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>{error}</p>
              <Button size="sm" variant="secondary" onClick={() => mutate()} style={{ marginTop: 8 }}>
                Retry
              </Button>
            </div>
          ) : technicians.length === 0 ? (
            <div style={{ padding: "64px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--r-xl)",
                  background: "var(--surface-sunken)",
                  display: "grid",
                  placeItems: "center",
                  marginBottom: 4,
                }}
              >
                <Users size={20} style={{ color: "var(--text-muted)" }} strokeWidth={1.8} />
              </div>
              <p style={{ fontSize: "var(--font-base)", fontWeight: 500, color: "var(--text)", margin: 0 }}>No technicians yet</p>
              <p style={{ fontSize: "var(--font-sm)", color: "var(--text-secondary)", margin: 0 }}>
                Create a technician account to get started.
              </p>
              <Button size="sm" onClick={() => setShowCreate(true)} style={{ marginTop: 12 }}>
                <Plus size={13} strokeWidth={2.4} />
                New Technician
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-alt)" }}>
                    {["Account", "Email / Phone", "Active Load", "Status", "Joined"].map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "9px 20px",
                          fontSize: "var(--font-xs)",
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--text-muted)",
                          textAlign: "left",
                          borderBottom: "1px solid var(--border)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ padding: "32px 20px", textAlign: "center", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}
                      >
                        No technicians match &ldquo;{query}&rdquo;
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => (
                      <TechRow key={t.id} technician={t} workload={workloadById.get(t.id)} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Table footer */}
          {!loading && !fetchError && technicians.length > 0 && (
            <div
              style={{
                padding: "10px 20px",
                borderTop: "1px solid var(--divider)",
                background: "var(--surface-alt)",
                fontSize: "var(--font-xs)",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Users size={11} strokeWidth={2} />
              {filtered.length} of {technicians.length} technician{technicians.length !== 1 ? "s" : ""}
              {query && " — filtered"}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
