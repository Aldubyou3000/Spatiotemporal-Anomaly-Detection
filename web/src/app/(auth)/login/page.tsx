"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Layers, Lock, Mail, Moon, Shield, Smartphone, Sun } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { useTheme } from "@/context/ThemeContext";

const LOGIN_TIMEOUT_MS = 12_000;

function parseLockoutSeconds(msg: string): number | null {
  const m = msg.match(/try again in (\d+) seconds?/i);
  return m ? parseInt(m[1], 10) : null;
}

export default function LoginPage() {
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (lockedFor <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setLockedFor((s) => {
        if (s <= 1) { clearInterval(timerRef.current!); setError(""); return 0; }
        return s - 1;
      });
    }, 1_000);
    return () => clearInterval(timerRef.current!);
  }, [lockedFor]);

  const isLocked = lockedFor > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || isLocked) return;
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
      const msg = err instanceof Error ? err.message : "Login failed. Check your credentials.";
      const lockSecs = parseLockoutSeconds(msg);
      if (lockSecs) setLockedFor(lockSecs);
      setError(msg);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Radial gradient backdrop */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(900px 600px at 80% -10%, color-mix(in oklab, var(--brand) 14%, transparent), transparent 60%), " +
            "radial-gradient(700px 500px at 0% 100%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 60%)",
        }}
      />

      {/* Top bar */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--r-lg)",
              background: "linear-gradient(135deg, var(--brand) 0%, #5B9FE8 100%)",
              display: "grid",
              placeItems: "center",
              color: "var(--brand-fg)",
              boxShadow: "var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <Layers size={16} />
          </div>
          <div style={{ lineHeight: 1.15 }}>
            <div
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
              }}
            >
              AWS QC Pipeline
            </div>
            <div style={{ fontSize: "var(--font-base)", fontWeight: 600, color: "var(--text)" }}>
              Analyst Console
            </div>
          </div>
        </div>

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-secondary)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            transition: "all 0.12s ease",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--surface-sunken)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* Centered card */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          placeItems: "center",
          padding: "40px 24px 60px",
          minHeight: "calc(100vh - 80px)",
        }}
      >
        <div
          className="animate-fade-in-up"
          style={{
            width: "min(420px, 100%)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2xl)",
            boxShadow: "var(--shadow-lg)",
            overflow: "hidden",
          }}
        >
          {/* Card header */}
          <div style={{ padding: "32px 36px 24px" }}>
            <div
              style={{
                fontSize: "var(--font-xs)",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--brand)",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Welcome back
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--text)",
              }}
            >
              Sign in to your console
            </h1>
            <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: "var(--font-sm)" }}>
              Continue to the spatiotemporal anomaly dashboard.
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: "4px 36px 28px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Credential */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>
                Email or username
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Mail
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder="analyst@aws.gov"
                  required
                  autoFocus
                  autoComplete="username"
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: 34,
                    paddingLeft: 32,
                    paddingRight: 12,
                    borderRadius: "var(--r-md)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontSize: "var(--font-sm)",
                    outline: "none",
                    boxShadow: "var(--shadow-xs)",
                    transition: "border-color 0.12s ease, box-shadow 0.12s ease",
                    opacity: loading ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--brand)";
                    e.currentTarget.style.boxShadow = "var(--shadow-focus)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.boxShadow = "var(--shadow-xs)";
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label style={{ fontSize: "var(--font-sm)", fontWeight: 500, color: "var(--text-secondary)" }}>
                  Password
                </label>
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Lock
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: 34,
                    paddingLeft: 32,
                    paddingRight: 36,
                    borderRadius: "var(--r-md)",
                    border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`,
                    background: "var(--surface)",
                    color: "var(--text)",
                    fontSize: "var(--font-sm)",
                    outline: "none",
                    boxShadow: "var(--shadow-xs)",
                    transition: "border-color 0.12s ease, box-shadow 0.12s ease",
                    opacity: loading ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--brand)";
                    e.currentTarget.style.boxShadow = error
                      ? "0 0 0 4px rgba(220,38,38,0.12)"
                      : "var(--shadow-focus)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = error ? "var(--danger)" : "var(--border)";
                    e.currentTarget.style.boxShadow = "var(--shadow-xs)";
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "transparent",
                    border: 0,
                    color: "var(--text-muted)",
                    width: 24,
                    height: 24,
                    borderRadius: "var(--r-sm)",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error / lockout banner */}
            {error && (
              <div
                className="animate-fade-in"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--r-md)",
                  background: "var(--danger-soft)",
                  border: "1px solid var(--danger-on)",
                  borderColor: "rgba(220,38,38,0.2)",
                }}
              >
                {isLocked
                  ? <Lock size={14} style={{ color: "var(--danger-on)", flexShrink: 0, marginTop: 1 }} />
                  : <AlertCircle size={14} style={{ color: "var(--danger-on)", flexShrink: 0, marginTop: 1 }} />
                }
                <div>
                  <p style={{ margin: 0, fontSize: "var(--font-sm)", color: "var(--danger-on)", lineHeight: 1.4 }}>
                    {error}
                  </p>
                  {isLocked && (
                    <p style={{ margin: "2px 0 0", fontSize: "var(--font-sm)", color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
                      Unlocks in {lockedFor}s
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || isLocked || !credential.trim() || !password}
              style={{
                marginTop: 6,
                width: "100%",
                height: 40,
                borderRadius: "var(--r-md)",
                border: "1px solid var(--brand)",
                background: loading || isLocked || !credential.trim() || !password
                  ? "rgba(30,111,217,0.5)"
                  : "var(--brand)",
                color: "var(--brand-fg)",
                fontSize: "var(--font-base)",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: loading || isLocked || !credential.trim() || !password
                  ? "not-allowed"
                  : "pointer",
                boxShadow: "var(--shadow-sm), inset 0 1px 0 rgba(255,255,255,0.18)",
                transition: "all 0.12s ease",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (!loading && !isLocked && credential.trim() && password) {
                  (e.currentTarget as HTMLElement).style.background = "var(--brand-hover)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  loading || isLocked || !credential.trim() || !password
                    ? "rgba(30,111,217,0.5)"
                    : "var(--brand)";
              }}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.4)",
                      borderTopColor: "white",
                      animation: "spin 700ms linear infinite",
                      flexShrink: 0,
                    }}
                  />
                  Signing in…
                </>
              ) : isLocked ? (
                <>
                  <Lock size={14} />
                  Locked — {lockedFor}s
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Card footer */}
          <div
            style={{
              borderTop: "1px solid var(--divider)",
              padding: "14px 36px",
              background: "var(--surface-alt)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "var(--font-sm)",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Smartphone size={13} />
              Field technician?
            </span>
            <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
              Use the mobile app →
            </span>
          </div>
        </div>

        {/* Below-card meta */}
        <div
          style={{
            marginTop: 20,
            fontSize: "var(--font-xs)",
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Shield size={12} />
            PAGASA · Analyst Console
          </span>
          <span>·</span>
          <span>v2.4.1</span>
        </div>
      </div>
    </div>
  );
}
