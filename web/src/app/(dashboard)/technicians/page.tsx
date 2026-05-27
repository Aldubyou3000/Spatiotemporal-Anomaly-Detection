"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
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
import { TechnicianRowSkeleton } from "@/components/ui/Skeleton";
import { techniciansApi } from "@/lib/api/technicians";
import { cn } from "@/lib/cn";
import type { TechnicianCreate, TechnicianProfile } from "@/types/technicians";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-surface border border-border rounded-2xl w-full max-w-lg p-6 animate-scale-in"
        style={{ boxShadow: "var(--shadow-xl, var(--shadow-lg))" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-brand-soft grid place-items-center">
              <Plus size={15} className="text-brand" strokeWidth={2.4} />
            </div>
            <h2 className="font-display text-[18px] font-semibold tracking-tight text-text">
              New Technician Account
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg grid place-items-center text-text-tertiary hover:text-text hover:bg-surface-muted transition-colors"
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Santos"
            required
            autoFocus
          />

          <div className="grid grid-cols-2 gap-3">
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

          <p className="text-[11px] text-text-tertiary -mt-1">
            The technician can log in immediately with this username and password via the mobile app.
          </p>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-soft border border-danger/20">
              <AlertTriangle size={13} className="text-danger shrink-0 mt-0.5" strokeWidth={2.4} />
              <p className="text-[12px] text-danger">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" loading={saving}>
              {saving ? "Creating…" : "Create Account"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Technician Row ───────────────────────────────────────────────────────────

function TechnicianRow({
  technician,
  onToggled,
}: {
  technician: TechnicianProfile;
  onToggled: (t: TechnicianProfile) => void;
}) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      const updated = await techniciansApi.toggleActive(technician.id);
      onToggled(updated);
    } catch {
      // silently ignore; leave state unchanged
    } finally {
      setToggling(false);
    }
  }

  const initials = technician.full_name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-4",
        "px-4 py-3.5 border-b border-border last:border-b-0",
        !technician.is_active && "opacity-60",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "h-9 w-9 rounded-full grid place-items-center text-[12px] font-semibold shrink-0",
          technician.is_active
            ? "bg-brand text-white"
            : "bg-surface-muted text-text-tertiary",
        )}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[14px] font-medium text-text truncate">{technician.full_name}</p>
          <Badge tone={technician.is_active ? "success" : "neutral"} dot>
            {technician.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="text-[12px] text-text-tertiary mt-0.5 font-mono">
          @{technician.username}
          <span className="font-sans ml-2 text-text-secondary">{technician.email}</span>
          {technician.phone && (
            <span className="font-sans ml-2">{technician.phone}</span>
          )}
        </p>
        {technician.station_ids.length > 0 && (
          <p className="text-[11px] text-text-tertiary mt-0.5">
            Stations: {technician.station_ids.join(", ")}
          </p>
        )}
      </div>

      {/* Toggle */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={toggling}
        title={technician.is_active ? "Deactivate account" : "Activate account"}
        className={cn(
          "h-8 w-8 rounded-lg grid place-items-center transition-colors disabled:opacity-50",
          technician.is_active
            ? "text-text-tertiary hover:text-danger hover:bg-danger-soft"
            : "text-text-tertiary hover:text-success hover:bg-success-soft",
        )}
      >
        {toggling ? (
          <Loader2 size={14} className="animate-spin" />
        ) : technician.is_active ? (
          <UserMinus size={14} strokeWidth={2.2} />
        ) : (
          <UserCheck size={14} strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TechniciansPage() {
  const { loading: authLoading } = useAuth();
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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
    setTechnicians((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t)),
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-text-tertiary text-[13px] font-mono">Loading session…</p>
      </div>
    );
  }

  const activeCount = technicians.filter((t) => t.is_active).length;

  return (
    <>
      <Header
        title="Technicians"
        description={`${activeCount} active · ${technicians.length} total`}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} strokeWidth={2.4} />
            New Technician
          </Button>
        }
      />

      <div className="px-8 py-6 max-w-225 w-full mx-auto space-y-5">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Field Team
          </p>
          <button
            type="button"
            onClick={fetchTechnicians}
            className="h-9 px-3 rounded-lg text-[13px] text-text-secondary hover:text-text hover:bg-surface-muted transition-colors flex items-center gap-1.5 border border-border-strong"
          >
            <RefreshCw size={13} strokeWidth={2.2} className={cn(loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* List */}
        <div
          className="bg-surface border border-border rounded-2xl overflow-hidden"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          {loading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <TechnicianRowSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center gap-2">
              <AlertTriangle size={20} className="text-danger" strokeWidth={2} />
              <p className="text-[14px] font-medium text-text">Failed to load</p>
              <p className="text-[12px] text-text-secondary">{error}</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={fetchTechnicians}>
                Retry
              </Button>
            </div>
          ) : technicians.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-surface-muted grid place-items-center mb-1">
                <Users size={20} className="text-text-tertiary" strokeWidth={2} />
              </div>
              <p className="text-[14px] font-medium text-text">No technicians yet</p>
              <p className="text-[12px] text-text-secondary">
                Create a technician account to get started.
              </p>
              <Button size="sm" className="mt-3" onClick={() => setShowCreate(true)}>
                <Plus size={13} strokeWidth={2.4} />
                New Technician
              </Button>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-border bg-surface-muted/50 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  Account
                </p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  Actions
                </p>
              </div>
              <div className="stagger">
                {technicians.map((t) => (
                  <TechnicianRow key={t.id} technician={t} onToggled={handleToggled} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
