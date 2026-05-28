"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { techniciansApi } from "@/lib/api/technicians";
import type { TechnicianCreate, TechnicianProfile } from "@/types/technicians";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
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
    tone === "warning" ? "color-mix(in oklab, var(--warning) 12%, transparent)" :
    tone === "brand"   ? "var(--brand-soft)" :
    "var(--surface-sunken)";
  const iconColor =
    tone === "success" ? "var(--success)" :
    tone === "warning" ? "var(--warning)" :
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
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !username.trim() || !email.trim() || !password.trim()) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
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
      onCreated(technician);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(10,13,18,0.45)",
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        className="animate-fade-in-up"
        style={{
          width: "min(480px, 100%)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2xl)",
          boxShadow: "var(--shadow-xl)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          style={{
            padding: "18px 24px 14px",
            borderBottom: "1px solid var(--divider)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>
              New Technician Account
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}>
              The technician can log in immediately via the mobile app.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--r-md)",
              border: 0,
              background: "transparent",
              color: "var(--text-muted)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              transition: "background 0.12s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
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

          <Input
            label="Temporary Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            required
          />

          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 12px",
                borderRadius: "var(--r-md)",
                background: "var(--danger-soft)",
                border: "1px solid rgba(220,38,38,0.2)",
              }}
            >
              <AlertTriangle size={13} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} strokeWidth={2.4} />
              <p style={{ fontSize: "var(--font-sm)", color: "var(--danger)", margin: 0 }}>{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--divider)",
            background: "var(--surface-alt)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} onClick={handleSubmit as unknown as React.MouseEventHandler}>
            <Send size={13} strokeWidth={2.2} />
            {saving ? "Creating…" : "Create Account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function TechRow({
  technician,
  onToggled,
}: {
  technician: TechnicianProfile;
  onToggled: (t: TechnicianProfile) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [hovered, setHovered] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      const updated = await techniciansApi.toggleActive(technician.id);
      onToggled(updated);
    } catch {
      // silently ignore
    } finally {
      setToggling(false);
    }
  }

  const inits = initials(technician.full_name);

  return (
    <tr
      style={{
        background: hovered ? "var(--surface-sunken)" : "transparent",
        transition: "background 0.1s ease",
        opacity: technician.is_active ? 1 : 0.65,
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
              background: technician.is_active
                ? "linear-gradient(135deg, var(--brand) 0%, #5B9FE8 100%)"
                : "var(--surface-sunken)",
              color: technician.is_active ? "white" : "var(--text-muted)",
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

      {/* Email */}
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

      {/* Stations */}
      <td style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        {technician.station_ids.length === 0 ? (
          <span style={{ fontSize: "var(--font-sm)", color: "var(--text-muted)", fontStyle: "italic" }}>None assigned</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {technician.station_ids.slice(0, 3).map((sid) => (
              <span
                key={sid}
                style={{
                  fontSize: "var(--font-xs)",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)",
                  background: "var(--surface-sunken)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-sm)",
                  padding: "1px 6px",
                }}
              >
                {sid}
              </span>
            ))}
            {technician.station_ids.length > 3 && (
              <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)" }}>
                +{technician.station_ids.length - 3}
              </span>
            )}
          </div>
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

      {/* Actions */}
      <td style={{ padding: "12px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            title={technician.is_active ? "Deactivate account" : "Activate account"}
            style={{
              width: 30,
              height: 30,
              borderRadius: "var(--r-md)",
              border: 0,
              background: "transparent",
              color: "var(--text-muted)",
              display: "grid",
              placeItems: "center",
              cursor: toggling ? "default" : "pointer",
              opacity: toggling ? 0.5 : 1,
              transition: "background 0.12s ease, color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              if (!toggling) {
                (e.currentTarget as HTMLElement).style.background = technician.is_active ? "var(--danger-soft)" : "color-mix(in oklab, var(--success) 12%, transparent)";
                (e.currentTarget as HTMLElement).style.color = technician.is_active ? "var(--danger)" : "var(--success)";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
            }}
          >
            {toggling ? (
              <Loader2 size={13} style={{ animation: "spin 700ms linear infinite" }} />
            ) : technician.is_active ? (
              <UserMinus size={14} strokeWidth={2.2} />
            ) : (
              <UserCheck size={14} strokeWidth={2.2} />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TechniciansPage() {
  const { loading: authLoading } = useAuth();
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");

  const fetchTechnicians = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await techniciansApi.list();
      setTechnicians(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load technicians.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTechnicians();
  }, [fetchTechnicians]);

  function handleCreated(t: TechnicianProfile) {
    setShowCreate(false);
    setTechnicians((prev) => [t, ...prev]);
  }

  function handleToggled(updated: TechnicianProfile) {
    setTechnicians((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
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
  const inactiveCount = technicians.length - activeCount;
  const totalStations = [...new Set(technicians.flatMap((t) => t.station_ids))].length;

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <Header
        title="Technicians"
        description={`${activeCount} active · ${technicians.length} total`}
        live
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={fetchTechnicians}
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: "var(--font-sm)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <RefreshCw size={13} strokeWidth={2.2} style={{ animation: loading ? "spin 700ms linear infinite" : undefined }} />
              Refresh
            </button>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus size={14} strokeWidth={2.4} />
              New Technician
            </Button>
          </div>
        }
      />

      <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <StatCard label="Active" value={activeCount} icon={<Users size={15} />} tone="success" />
          <StatCard label="Inactive" value={inactiveCount} icon={<UserMinus size={15} />} tone="neutral" />
          <StatCard label="Total accounts" value={technicians.length} icon={<Users size={15} />} tone="brand" />
          <StatCard label="Stations covered" value={totalStations} icon={<UserCheck size={15} />} tone="neutral" />
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
              <Button size="sm" variant="secondary" onClick={fetchTechnicians} style={{ marginTop: 8 }}>
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
                    {["Account", "Email / Phone", "Stations", "Status", "Joined", ""].map((col) => (
                      <th
                        key={col}
                        style={{
                          padding: "9px 20px",
                          fontSize: "var(--font-xs)",
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--text-muted)",
                          textAlign: col === "" ? "right" : "left",
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
                        colSpan={6}
                        style={{ padding: "32px 20px", textAlign: "center", fontSize: "var(--font-sm)", color: "var(--text-muted)" }}
                      >
                        No technicians match &ldquo;{query}&rdquo;
                      </td>
                    </tr>
                  ) : (
                    filtered.map((t) => (
                      <TechRow key={t.id} technician={t} onToggled={handleToggled} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Table footer */}
          {!loading && !error && technicians.length > 0 && (
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
