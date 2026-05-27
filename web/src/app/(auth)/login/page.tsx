"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Waves } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";

const LOGIN_TIMEOUT_MS = 12_000;

export default function LoginPage() {
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    const timeout = setTimeout(() => {
      setLoading(false);
      setError("Request timed out. Check that the API server is running.");
    }, LOGIN_TIMEOUT_MS);

    try {
      await authApi.login({ credential, password });
      clearTimeout(timeout);
      router.replace("/zones");
    } catch (err) {
      clearTimeout(timeout);
      setLoading(false);
      setError(err instanceof Error ? err.message : "Login failed. Check your credentials.");
    }
  }

  return (
    <div className="animate-fade-in-up">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl bg-brand grid place-items-center"
            style={{ boxShadow: "0 0 0 3px var(--brand-soft), var(--shadow-sm)" }}
          >
            <Waves size={19} className="text-white" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-tertiary">
              AWS QC Pipeline
            </p>
            <p className="text-[14px] font-semibold text-text">Analyst Console</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* Card */}
      <div
        className="bg-surface border border-border rounded-2xl overflow-hidden"
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        {/* Card header stripe */}
        <div className="px-8 pt-8 pb-6 border-b border-border">
          <h1 className="font-display text-[30px] font-semibold tracking-tight text-text leading-none">
            Welcome back
          </h1>
          <p className="text-[14px] text-text-secondary mt-2 leading-snug">
            Sign in to the spatiotemporal anomaly dashboard.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
          {/* Credential field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary block">
              Username or Email
            </label>
            <input
              type="text"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="analyst@aws.gov"
              required
              autoFocus
              autoComplete="username"
              disabled={loading}
              className={cn(
                "w-full h-11 px-4 rounded-xl text-[14px] text-text bg-bg",
                "border border-border-strong",
                "placeholder:text-text-tertiary",
                "transition-[border-color,box-shadow] duration-150",
                "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            />
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary block">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                disabled={loading}
                className={cn(
                  "w-full h-11 px-4 pr-11 rounded-xl text-[14px] text-text bg-bg",
                  "border border-border-strong",
                  "placeholder:text-text-tertiary",
                  "transition-[border-color,box-shadow] duration-150",
                  "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  error && "border-danger focus:border-danger focus:ring-danger-soft",
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-0 h-11 w-11 grid place-items-center text-text-tertiary hover:text-text-secondary transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword
                  ? <EyeOff size={15} strokeWidth={2} />
                  : <Eye size={15} strokeWidth={2} />
                }
              </button>
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-danger-soft border border-danger/20 animate-fade-in">
              <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" strokeWidth={2.2} />
              <p className="text-[13px] text-danger leading-snug">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !credential.trim() || !password}
            className={cn(
              "w-full h-12 rounded-xl text-[15px] font-semibold",
              "flex items-center justify-center gap-2.5",
              "transition-all duration-180 ease-in-out",
              "focus:outline-none focus:ring-4 focus:ring-brand-soft",
              "active:scale-[0.98]",
              loading || !credential.trim() || !password
                ? "bg-brand/50 text-white/70 cursor-not-allowed"
                : "bg-brand text-white hover:bg-brand-pressed shadow-sm",
            )}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-r-transparent animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={16} strokeWidth={2.5} />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="text-center text-[12px] text-text-tertiary mt-6 leading-relaxed">
        Field technicians — use the{" "}
        <span className="font-medium text-text-secondary">mobile app</span> to log in.
      </p>
    </div>
  );
}
