"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Lock } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { SentinelMark } from "@/components/ui/SentinelMark";
import "leaflet/dist/leaflet.css";

const LOGIN_TIMEOUT_MS = 60_000;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function apiBase(): string {
  if (typeof window !== "undefined" && window.location.hostname.endsWith("vercel.app")) {
    return window.location.origin;
  }
  return API_URL;
}
const GOOGLE_OAUTH_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_OAUTH === "true";

function parseLockoutSeconds(msg: string): number | null {
  const m = msg.match(/try again in (\d+) seconds?/i);
  return m ? parseInt(m[1], 10) : null;
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "This Google account isn't an authorised analyst. Contact your administrator.",
  oauth_state: "Google sign-in could not be verified. Please try again.",
  oauth_cancelled: "Google sign-in was cancelled.",
  oauth_unavailable: "Google sign-in is temporarily unavailable. Use your password instead.",
  oauth_disabled: "Google sign-in is not enabled. Use your password instead.",
};

export default function LoginPage() {
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockedFor, setLockedFor] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();
  const philMapContainerRef = useRef<HTMLDivElement | null>(null);
  const philMapRef = useRef<import("leaflet").Map | null>(null);

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

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code && OAUTH_ERROR_MESSAGES[code]) {
      setError(OAUTH_ERROR_MESSAGES[code]);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Warm Render on page load so the first login doesn't hit a 50s cold start
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL;
    // Fire-and-forget pings — both direct (wakes Render) and proxied (warms Vercel edge)
    if (base && !base.includes("localhost")) {
      fetch(new URL("/health", base).toString(), { cache: "no-store" }).catch(() => {});
    }
    fetch("/api/health", { cache: "no-store" }).catch(() => {});
    fetch("/health", { cache: "no-store" }).catch(() => {});
  }, []);

  // Decorative Philippines map — zoomed in with place names, UI only (low opacity, non-interactive)
  useEffect(() => {
    if (!philMapContainerRef.current || philMapRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !philMapContainerRef.current || philMapRef.current) return;
      const map = L.map(philMapContainerRef.current, {
        center: [14.62, 121.06],
        zoom: 13,
        zoomSnap: 0.5,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        // leaflet `tap` is runtime-only (types omit it)
        ...( { tap: false } as unknown as L.MapOptions),
      } as L.MapOptions);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        opacity: 1,
      }).addTo(map);
      philMapRef.current = map;
      // Ensure tiles render after flex layout settles
      requestAnimationFrame(() => map.invalidateSize({ animate: false }));
      setTimeout(() => map.invalidateSize({ animate: false }), 300);
    })();
    return () => {
      cancelled = true;
      if (philMapRef.current) {
        philMapRef.current.remove();
        philMapRef.current = null;
      }
    };
  }, []);

  const isLocked = lockedFor > 0;

  function handleGoogleSignIn() {
    if (loading || isLocked) return;
    window.location.href = `${apiBase()}/api/auth/oauth/google/start`;
  }

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
    <div style={{ minHeight: "100vh", display: "flex", background: "#0A0D12" }}>
      {/* ── Left: light panel — exactly 50% on desktop, hidden on mobile */}
      <div
        className="hidden md:flex"
        style={{
          flex: "0 0 50%",
          maxWidth: "50%",
          background: "#EDEEF0",
          position: "relative",
          flexDirection: "column",
          padding: "28px 36px 32px",
          overflow: "hidden",
        }}
      >
        {/* Decorative Quezon City map — street-level zoom, names visible, nudged lower, low opacity + gradient veil (UI only, non-interactive) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.52,
            pointerEvents: "none",
            transform: "translateY(56px)",
          }}
        >
          <div ref={philMapContainerRef} style={{ width: "100%", height: "100%" }} />
        </div>
        {/* Gradient veil — keeps map subtle and ensures headline/logo stay crisp on #EDEEF0 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(to bottom, rgba(237,238,240,0.88) 0%, rgba(237,238,240,0.38) 22%, rgba(237,238,240,0.10) 40%, rgba(237,238,240,0.22) 62%, rgba(237,238,240,0.78) 82%, #EDEEF0 100%), linear-gradient(to right, rgba(237,238,240,0.72) 0%, transparent 18%, transparent 82%, rgba(237,238,240,0.50) 100%), radial-gradient(700px 420px at 68% 36%, transparent 22%, rgba(237,238,240,0.55) 78%)",
          }}
        />
        {/* subtle top highlight — sits above veil */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(800px 500px at 20% 0%, rgba(255,255,255,0.88), transparent 60%), radial-gradient(600px 400px at 100% 90%, rgba(30,111,217,0.05), transparent 60%)",
            pointerEvents: "none",
          }}
        />

        {/* Logo — top left — PAGASA first (jpg) + Sentinel (bigger) */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAihElEQVR42s2deZhcZZX/P+e999atrbur16SzkZVAAmGLAsYRCIgyIC5I0HEFBlEYwBEVZxRDlBl0VGCUGWXnpyiasMMosgWQVQmyBUgIZE96X2qvuve+5/dHVSdhCSShWd7nuU8/3VV967zf97znPcv33BJ2bAhggAiAA77isWLJgVRLh4mN3o/qDNB2kGQi7vuOMaVYLNbn+/6qpqamv02aNGnpHXfc8aAxpqCqAM7ChQt10aJFltEYqsJ99zkcdli4Rd4bhuZi5BBUD0TtTIwZQ2EoJWccZBjuLeK4vRhZqU7sr/ip+zjzd4+xaMv/O4AFdEeAebPhbAGuqWMqxeEviY2OQ+1s9NX319f8yRhDLBYjnU6/NGbMmJsPOeSQqy+99NLlURS98t67OharwwKp3ePm3nGI/3lUF2CjffCTLqoQBiAC+UHk9Lkw1ANGtsJjjCLusxpP3EDLpF+z7pnV9RffknxSvwG07zZWvPjPxTgFEVERtPZTQhGJRMTWr5G/qzHG1l8LR1bTGKONjY3V2bNnX3XRRRdN3maBZJfBA7h6dYabh/+Dm7MD/NkqtxWV6/uU63tDru8LWdIbccOA5do1KpkOFbCyjXwiqFCfk+vlJN10MXvNH/NW5JPaJRBPfU4cZ9M2wAX1D9aduYwxkYgE1AVta2vrP/LII78Si8UAWLhwodmpLatae/+SnmO4OfsSf7bKjYPKkt6A63ujGoD1a0lv7bWtAKoY82oZIxEJtgDp+Rtom/AZxFA3X68LotkOeMpCFYn5v5Bq6Vps1AmEIAq42/m/N5mzGsAVEQXCvr6+lgceeODS2bNnX62qsUWLFtkdAlFVOA9BxHJD/w9JNNyGyFSyfSFRqIi41Ge9k8MALnX5CCrjZbDrOmlovRjdYpjkzWxg7ffpH43J2qWLCavH1oB7C9tseyouotbayHEcd8aMGfc8//zznxCRvKpKHeTXB2/JEsOCBRE39F9DQ8uXyPVHWBXkDUBTBceF4jDyL++v20DDa234K4ZF1SLiks7cpD8dOIFTJaofLPp6Glg7aRcuFFm7dEkdvKCucaMKXl0jRURca22wYsWKw2fNmnWLqsakBoS87s647z6HBQsiru+9hsaWLzHcF6DqvCF4uz5MTZs1ID/0Sflmy+K6Jr5CPvOK01Ykkgt+/D+E1Y/VwfN4+4cHBCtWrJg/d+7cKzzPi7YcXtuOpUtrbsri7h/Q1PYlhvoCRLy3YW1fvW4eEJAf/oS0jPk5Yl4hn9nmpAnxk58jrH71HQRvZDt71tpg+fLlXzjqqKNOAcLjjz/eecVpe9hhIdf3f4RU07kMD4QILu/c8FAbkB34FzqnnLCNWcPUL6W9fawElV+g1r6uBryNQ1Uxxrjlctk++uijP7vuuusmLlmypHaoqArLUX7T14jIZYSBotbUHLt3cIg4RKGV/k2XcPAnO+p20Dh1AK2E9kKiYB5I9E4DOCKiMSYqFAqJVatWtfX29t60dOlSw6GHGk6cEvFP3/oeDS0fo5CNMGbn5TMGggryx8uhXNgV/AWRiChMS34gTaV4e/2uRDS2TyMMvlx3eN8N8LbYYVW1a9as+ezChQv3BCI57LCQG3IdiDmTYtYi8q7Kh6qlMHwSc46cDEQGQErZr6DWqwMo75Z09ZPZDg8Pu7feeutp4rg1f0GrX6Yh00gYWETkXQSw5n8GFZ8NT51Ss4ETDkpgo+Prro3hXR4iYlSVDRs2HGfDIAkCGn2BalnfC/IBBlWkmFvAwqVxw+DzH0DtlHqU8a4LWI9YbDaf7zzt6A/ty3K7m7jeXlRKvE3+3q5ELEpQnc61Xz/ISLX64bpHbnmPDBGx5UpVn1m+4iDKHKyJRlCNeO8IaIkiGOo7woXwwJ1Ibb1TAIoNQ+kplg6I5Zlcte+Ztd1qC9Ui1dJBLsr0+pEuo3Pn0QFQbETRunv6xXIhCGvZsPfSGgMQBdNdwqB9NDXQjqKAec+Mj7QSqnHBiBBZsHVHweyEL61bLxlNAG3U7tIy1mcUt0i7b3B2VEpra1GI72JSSRAXWwiJhkoS5HJksonGYMVmK4kGJOGLk2nAafTAsdhiCVuq1DwLY94cQEfQUMjvSJ5+x1FMCL9Z/ZZ9K9kqI8vmZ5iWNtjtrbaM5KctTjqOOD6VdQPkHn6S8vOPYQeeQstr0WAI169iYz6VwMfShCTHI6lZxHc/kNTBc0lMzyBAVA5RRjJa+rqhohhDPpfjwNkz6enuwhizTZpv18LPRCqNSypTQkwStaOyJI1NTaQTO/b2yvLNDN34e4INt5Ga+TyZSSVkikNsgkNsPwVrQIfBUVgFuSeexmm8haA7RvHCyVSTH6bpqH8icfg+9VlF8LqBigJCOi4YGdXDruwSBf24sSRRoG85QBcIwxBVB6u8VtgoQlyXytpBei65BDv0a5rnb6TjFI/hOxsprGrBnxGRv18Ys3sZrQKRhzQr/Y/E2XhRgvT7I6b9Ik8Tayk8fQn9//cbwt8fS+tJZ9Nw8AxULaqCbPPhWp9ZdfQsldZj9z4XMS/ixiYSBvqWwyQBEaldbLMcWrfgrkvfb+4id9t3af3UchoPT0KsmcrTwvpFCaZeWCA1P6D6jEt1jcHfzUJMCTcI0YDSPL9C7m8u1dUQmxAjtXec1PsjSk9eS981d5K7+xw6//3UWorE2nqo/4oiz6gC6Pj+SwblrxgHZNRs62vT6QKqho3f+ynh8s8w5ZIXafxoBtvnouWQymqwVUGtUHnWZdXXUgwt9VBPwVf6b4oRDhjEUzSAaFjAs2g+QvshMauJcd8o4Dd+g7WnnELQVQBj6pm5t2dWYgx+PPGYwdW7Ccqgb0MYV9c8rQrrTvsWfsNCnJZGuv67mWhThGm1SFVIzLQ4SaXvphjeDMWMMVT7XaQTKmtdqlmXxgUhQdYhzBqq3aaWM1IQHzb/xOPFLzRhy2NpP/q3rP/6AiprBmqn89sAoqoax3FJtbbfZQhKDxNWV+PHZbTDuZoGGNadeQ5NB16CSY+l65cxeq71ePmsNEN/jIEFbzfL5EvKuLGI4fMjOqf3kWkZJneRUro9pDkzRIPk6Ng/R8O+FSpDLhoJklQIYeh+j9j4iNSsMvlnx9N50v1s/NYXCLryNUNsR3VzWUDcmL/mE//+84dcFkwqcUPf9fipb1Ep29EK2DWKMK7DxkWXkJpyCZnPtVB+qEzLxzxinUrXFT7rzksycK9lyjeGSReG6EmO4689B7F64p50exPIV9M4jUo8rJD81dPsHz3P3lNXkzFdSMJl4IY0iQkBnaeUWfcfSTDQdHiB+PRmxn55KRu+fRaTr7gCzOgCKCIm3tC45KIT5pVqdQU3uoxi9usY49SdI3mri+S4DoO3PoJuXkTbBY3oakt8lsV7yCXKCu2fqVJc49KSGea5n3RyW+o4lh1yOIPTO7G+ixGLK5ayGLy+XhZ8aCZX9oTEyi4H3/8njjnrBibN7qJ/RYamuRVMQum/LcbE/yqgmy3Jf2ih6cXr2PzjuYw792ujuHvVeH48GDdz9mVDXRsxLFaHj49ZJUHlN6Qy5i1nPVRBhWpfkaHffYcJ5wVgQTwFhfS+IcUXHcZ+r0TH9EH+2H80537qcu4++ysUZraSDAqks0OkhrNIrkzbC89z+eR2jp28G2XXUtqjnf877WS+e+Tl3P70R2koDzN4j4+bURrmhmhewIDdHNHyhQaiNReQe3hFzWC+dXsYiYiJN2Z+/fwDd60CHMNyFFWJx8y5FLPDeDGD7rrRUGtBhJ5fXUPLRx9n8E8t9F3t1c6TihDf3dI0P2Tg23DJ5rO44uwfUBoXxz72CBKAIlhjsL5PMNDH9/aayuQpU3i6p5+K5+OXqqQHBinu0cIvzzifK4tfpWXCMDOX5Ml8NEBUkLRimi04DmP/eYC+Ky8AFd6iF21V1bh+Ymj8/gefq6pSy3AsEssSTOkT7ZtMWP46ibRBTLir2meSHrp+GLv5UsRrpPtXLhsvSjD45xjEFGkWkqUcl5bP4I6zTqSxNEQUCHuUszQM9lJ0PBygai2TCJkzeRJWlcnNjcjwIMNiIBbDyVdJBzluO/NUfvXCV6neXMaqQ+UlQ+kZl+E/x+j5hUduWRvJibeTv/NJ3IY0GkW7urMi47gm1d551gt/vmnzSDGudmAskIilS127oPMayfVdRWNrrQ660weHxfGE3G23kJzxMqWVSfa4dZhxZ5RqUUWzgUcKLH7wU9x1+udpHBzAKqjnoZOmcmxlgObBHsRxCMVgAeN5WFWmT5zIBbMmMX3zGsqVCuK5WBUasoP86ayTufmBowluL9G9OMnmX8aJCkL2QZeuKxMk9yiTu+cabCC7at0DRDw/03r58MbVv66zNaJX1kAOPTRisTofau041RQG76SxzUM12BnfXDxDddBSfflGNPTpvibG6jNThAOGhnkR9Ac8c+1UbvriqcTDEqoGixA3hhXFKvtNHM/cSpa1hRJNwwPM8yxareIagxjDwXvN5tKjD2VO3wYKYYQRQS34psKS407npfvHMelHg2Q+EpC936Wy0RCfFJCYm0CCeyg+vQYnFd958MDzGpvvOKav62tq7Ss4g+42kbGiau8HOm8rfbK7xE22qe1IhvvCOu1D3sT4YVJJik+tpt15iuQRHm5jgf4bPXoXx8iviDFmapnbJ51AdnoHDQNDRK6DMQaJQvzxEzn7xZX8y6Q2NDfMZFvlbxrjzHse5uhxbTTG4/SUyvx9MMfGWBJPwNZDNS9fZmDWOP74l08z5fKLGVrmk/uLofHAkEmLijhjXRLTNzLw0MOYRGLHVUI1QsRzG5r+uP9Jv/r0EhG7TSj3KgBHQFyoZvOi8cUDLn38mCc7pv7KNrScpMUsRGFYI9tsP7dnYj6lJ5eRmN6PPy2N31mh+agqQ3fHKDwobOwfx7KPH0q8XCQygnEcCvk8gQgZlDm+8OE5s2ldv4lvrNxMcmwnRBFP92aJpErjprXslk7Su/sc0sUcUaWMej7WcYhXSvz14MP51P3XYfJVUvs6TPrPIk5KYdCQ2jtk8x8eQQPZkTg3QtUVx3HdhuZLPz7Ye/oSkWjE7m375tcCskgsqrJMCEFO9m7sfzRyYj+yyYYW8kOg+voaKaChUF37LP4xEeQELQjiQubjAZnpRR684hCGJo0hVc4irkd/scQRpUEaXYNXLvKSl+DUex/lxHEtNMZjNXKOWpJNTVjXJSaW8Pm/M7hmLeONpbm5mWd335eECG65ysCUcTz7wByO/Oi9yP4JnCYLeUFdxR3vYnPPEfQX3ijCsKi6iLgS83u95tZvV3q7rllSm+vrRmpmO4kuRYHF6gSfar28wfYd4FbyVxvXDWhocfF8qeeNwloSTi0iGhWq2OxqpN2goSJu/dVAsBtgZeteEBcMULSWeYV+zjtiHgumTeT2fMhznVN5Lt3GmlKVT8ahv1hCjCGyFi2XqbaN4flEE8eHWQbHT+aF8dOJm3oWxCqadnjB25v4uAB/mq35hA4QKjS4GGcT4VAOjGgdjKhGFFJlhADqemWTbrrUn3nQ/pXuTddQs3lsL5Ft3iBbqCyQiMXqDH9yyprw45mTEp49wA9yP3c03CCJtKGhxSXR6KiXMMR8iSoR2H5Im1p+VkcIYkppY4yetvEYG6JeDLtuDalSnm88sIzTn1uPO2E34pUSrakEN+RCDs4k6SgOExoHUQVjMJUS03L9pDvHcUQmST7mby0fiGCwdLdNoLzW2/rhI9N2BT9dxrX5GlHTWoMYB8d1cWMisfjLJtnwE3f8zP2i/PBXS8/cv2Ebkrm+UZH4jccCiVi40LBYncLRLc9UPpY5qyUT7JmeFp8XbzPf9JOxxb6JlnthMRcb7lNHC+CZ2sdumYdSKcYopdIYVWwQEB8/kaVjpvJUupWgcwIST2AB11p6E2key5b5ckcjvfk8rudhRCji8NLM/SimM5w2by7Tsn2UMTWAAVGlmEpTLbg1noDWZahvPD+l+KkOpSkzJG7sSWz0GwmD092guv9+e8/eIyoXv11dt/wFVEcYuW/qNO4Yx27RIoVFggiIof+wMfkOGCzBcAiFKO4H4qesT5r4EQ0gHiZuyd7j0jAv3FoY28ZsiuvSULdxGkRoLRtLZC2ZZIJbBoucEQwyty/HCjMJR2BWvp8ZEnFvVx8v9w1y8oRW/m1TL20dHdhqdYsmKrJFNbIPuDQeFtYzMgY9+3o4YA9UPaONDY6midkUsWUv4XGsBHU+Iiw/T2rzfusAjqhxNHXKlEk9PT1frgTBZ3qt7mlVUWuRchUtV3CkArSjJaXr/8XpvsKn9dgq475XwU8HJAp51JhaEUoVq4pxXNTUikHGWmwU4YowqIJNNfC/H5zHD2/+I80Jn5wTY0nZ8Nk5s1jV1c0VvXkyLR3YKKzdU4REPo/fERAO+Gw832foHo+xp1YYc0qRciVGqaNdiCUyWo0ylKtzqLr/RE8Fwsp6bsneiA2v5JPyzGt6UHZxCztANGvWrJZUKvWjdevWPV0oFBYFlcqeNgyUKAxFbSSOsYiok0mjtCF+iD9BsSF4bRZnjJJoqdLev4lInFrIBzieRz6fQ7s3EnZ3kSsWMY5Tq53EfHojBT/Ogn1mcW/VsCTRxufb0kzxDBf0VyiOmYARU8/bKlYMHYMb8VtC3E7FbVRsUYiNV0hF5HINlFMJqJSUaslSzEbkBkJKBYtxJuKnzkKcZdyUvYrrNk8eOQOoxb07BeCW1q5MJvOxlStXLisWi+eEYdgEhFJzKKWuwQ6qBlVxEi5OZgp2jZI+IGLOXVmaPxKgA4IzwzK99zmoKCJQEUN3dzf/7IdcPncPLt1vGgtMmWy5DCKk0ykWdw0x2NNNMplkwE9ysJbZJ+lxfl+FTMdYvKCKjth3I0jJMn3gOWS6on1C26er7H1XluQeFnpDIh2HaW+C0NaLyeIg4iJiCKuW3EBIGHgkkieSSD/BTUNfYYFEiNHtgbi9PhEREZtKpX6Yy2ZvDcNwch24N+4TcZXYlDmUVrrEdo9w2yz+nhE6rLCHxz7OEzSt76MQ95kx3MuXTZFPv29fxo0bx24TJzKvLUPLhtVEqqgYos6JnHz/Mh5c9gRutcJcT7m5v4DT0ooJKltsqqgSxj0yq7uZk3gSpsXQkuLvHuGOVfwZSrQ6wmT2wm1OQhi9ASsfyA2G2LCZRMOl3DR0FQv/EBsJMt4MQAGMiFg/Hr+qWCx+L7I2qmvcm7Y7aKVCcr/9Ka1qgyAkGjQU/+bSfaVPmI+z+/5r2Oehh8lXSnzQs3z1mKNQP0GkSqTKtBnTuWz+gbQ893fcnk041TJdnZPoaR/HKc0xqkODPOcmSRtDtI15N1FEJZFkv7/cx9T3byIs+PT+Lkbx8VryFkcpPucR3+Pgel5S3qzg6xKFSm4gJNV0Ivt+5HZ+vTnFIl6jia8G0BGRyPf9Kyvl8olAIDVK7Q6l+W2hRHLfGQT5/Qm7S1jPsPGiOOt+mqDvKo/YsQ7zX7qWI15Yw5SOFl5evQbfgIPi2IhUPE7b+AlcfsKx3HLIfuw/3I1aZcNwjhPmH4qXbqQHgytbS9hilTDp07Cyl4/1LsY9xmHwdy5rFyVY/+ME4bABW6Xw/ATS//ABbLH0inLnG1XNEXEZ7gtINnyYlH8zj+OyBLMtiO6rDowwkUh8v1QqnbQrrQ4aWrzWON6c4xheegut/6w0fjDEJKBxbgBtMeZ95kWe/cOdfHPP02hd9ih7r1hNFaGC0KoRB45tRR2XFwaGWe430BL3eWoAXly/gWMPmMMddz1MNjW55mJqjapXiiX59LUXsfcXXoZUkvSckJaPBKT2ifD3VEqPl8A/kuTMVuzzvTsG4FYgPbJ9AU3tR7C69zIWdJzI0qVuvdVhy5Z0gKipqWl+Pp+/J4qisK55soMUB6y1pJIpVq17mTHawNqz5zH5B2uxRR/THBH1GJy0QgvkLrb8ZOhcHjhjAe6GzahxwDjYoEpULqEIJh4n6fvEbEQeYWb3Wv7340dy3/Mv8u/rB+nIZLBhQK6thfkX/ZZvTP4JqdNiMKhEWcHpsES9BmccbPqx0vyPd1I+bA6Tb+ojG9VcWt3ZtFZDi0e272SO77hqxMUZaVvSOXPmpAqFwuVRFOkbtFu9SZ+CYIsVpC1BbM+vMXRHGTNOsIOCM9YytNSj+JhDwxnCGdF/8g8X/hZaW0j5hoawSqPn0pzJ0JJpIhPzcKKQCEgb4YXmsZx9x/10asjUaomS75JvbOKwi3/H6emLSJ3pkr/bIb/MxRlj0ZzgjDFUnstRHf44icPmEJYjxDG7mpF2KWYtTuwiFveN53gsC2serAPYVatW/WsURVNla9pm19gdTs3P6zj1Cwwu/QDRxgLSaBi4Kcaa7yZZc06SwuMe7T+0fKv5Aj79w5+hfQG5tgyhZ9CgilaraBQhqoi12CCgKebx98Z2/m31ZgbCIu7GEp/7wY/4xvif0LIQhv8UY813E6w+J0n2Pg98ARPQfVU7bad+pxYLvQU2FiJCGFiSDY2IPR8RZTbiAtGECRNaNnd1/esIS+0tUpZABLc5TsuJP2LThccw8RcR6b0Ff7zFn2RJzgzRAUPj2YZT776GA656lNt2+yxPf+iD5Ca0QkxwbITUGWNqDEUMbgDhQMR+997JCcXzmPPlVTAviQ4qDXsFxMb6aKQkZ0ZIh6Hvv7N4s35M+oApoHbnbN/2upUKQxY39nmu67mABbJSABKp1OnlYvGSumF0d2VxrLWk02lWrlxJZ2cnNggxnsvmH12JG51J2xebifqjmpPpgmmo8VxIGaRSofonywuPTOYpOYBVY2bT19FJ0U8jAolsno7hjczof5Z97BPMPGQd5cjH28cl1h4iWuPLaFRLHJg2l+ITffTdfjK7XXYJSoRxHHorlhl/HmK4qrtiA0e2ckhjq0u272cc3/FNUVWJxfyHwqB6EDV/zxkNANVaUEUch3VfX0R66o9oOaUFumwtU2LrCYYI1l+Qwqow5QdD0FUhfNohv84n8j20CImxVTxTJTZOYb7LposbiTYLnaeXcBt1a+tfBHS4FB8aoOvKo5j0q9/iNse20N1GBUCweL6hWl7DQHW2aWsbN9PaaP+6Y+WMIvuwTu6JmHThQvKrvk3PT4ehpd6OIiCtStBjKD0ndHy6hLouQUMjfZtbKOSTpA+xtJ1fhZkx+rpbyMWa0MCj+pygZcUk6guhtWw4bQ7Z2wfouvJoJv78GtyW+GjUg18bfFTLihebTKv/AVMs5g611vrI29AnUk9/IZZJP19EqD9lwzmKtUU08sjeHWPNd5JMOKdE6sAQ8ZXKcmHwRgebh6gslB9yefm0JOk9qzS8rwLDMGFREQT6f++jKZCEgzSE9Pw8y8A9X2G3y67FG9tQ5wgKbwNH3+LFAY4wkW7pE9G3qemj5hFZy7jvf5XUkTey9tx9GLhliMHbhMwRSvoIi2aF/AMe2YddJK6k9glJHh7Qf12Mxg8E9Fztk1vqQUxxx1ky8yO8MQZpsRT+PsTas1uxyV8y+fKLcTJ+Lf9n3rbGJsFGgD3QVat71F16GS3ul9UtvMptqasQRTR/ah7JeX+i7/JLkeSVmIa1hOsd3FkxBi+Mk5oTYtWixmBDIRgypA8IKb4AUdkgHUL3RXHC7ioNH+xj3VltWPt52r/5dVL7TMJGYS0vYGqLVkuwbiWGo2/RnRl5dkNYBavTxHG9l2wYTK0/rUJ21UUaOUTWrlpJy5jON4G4phm6qo+hW6+nsuIWYp1PE2vJUVrhkpojJI+14Bv05Rjdl8eJ7xaQ+cci1fXK8H1poso0nDEfpemozxCbO3mH5BxW2O1P+bd6iGztP7a2KK4X6w6DaoeMAoCpdJqlT73AmM5O1G6fcq1aY0qZlIcxUO23FB5bTunZvxL1P4UtrIHiAHGnhBsNUs0LVprATMBpm03ygPeR2m9f/GkdYKtE2eIW/3O7hGagv6p88L5hssEoALilP9d1u4jCMfVuTdllO2ctxFN4//NXaJ8IQWW7E3oFFc5axHMx6QTixLAlS5QtYUtVvPywdc6er1G1yxE3idvoY5IuagNssYSW64902kFbp0A50tEz9uLgouRBxozWPavRSAVlR5aj7jkFFvrztWhBpNax0xojam0pmEw1sn3VDFFVGUAYePd7+bYJ/ksuxnRjo2nbaPqoHLo711dQB20kBFerWCPieBvdQiEfWOaKcRRRGY3+hFFpc1AVHKfXRcwLwAdG6946Wv24XsxR319BMbcZY+bqCGP9vTFqyibOi0Zd97G6qgi8Z8RTHE/xWRZX/oLj8h4bNT1xnUcNicb7MaZS68flvdKNK9hQgEdS8KARoc4WeK8MgxjUb7jLMNC1AuMsq9cH3/22elXF8RyK2QFWrXm8C9aJMc/WTcN7oe2/1oxn3Bc56PhHDWpRP/HbeneevgcEjEikQbmFE6cMqXFw/eSvpeZU6nsCQBHUj/2BO35RqaXup+x1HY47UN8m9l1+YIKhXFCMXlKDM5TMlD2vMZ43XKegvZsg1mhwjltmzMTLR8qaDs88OCjx5IX10OHdA1BtRKrJUK3cxHEdT7BYHUScricf7I0lGi6ud1FF7+ruEDHEk5fx8vPran0iNYGMPXTBRXjxl1F13xUQVRXXg3KhDHrOloeO1eWbcuQJP3X8+Bp993aJRdXBjfXonnN/UD90t2wJ4fbLitrcfgquC6r2Hd8qQkgq4xCU/40FY1axhFoPS12+55b8bz7VMfYUx/VE3w35VCMcVzTT9jX+dk//COXXsPV0c+hZf6+kW76PMW6dC/1Obd2AxjaP4b7rWTD24tehlUWAM7x+zd1+pvX75p2WDw0Q45HK/Iy+TTe+fp9InZlus30/JN18FSI71yey6ysb0NDqkR96GG37IqqG4193i0aouqWB3h/GGpsvR8yIfPq2g4d4pDN/0PzgN+sHbbQ9bkyEtY4Whk+moeVqjPHqzYdvS9dyrcLV5lHKPcjw0NEskBLn1fnZ2zHiaiOnkhv6it/cehnG8bTWXWrfJpsXIcYj3fx7zfZ/DhuZVz/h3LxOiGKJQqP5oZNoHnM+rufU3Ydw1FZbNcRxhMZWl8LQ7+lZ9RFOnDLEQh2xe28UQlmNIlMZGjg10TbmXMeLGR1d+WqPQVY1uJ5DpuPHWsx+tl6x1Fd/htnuc35sZHSg61ztnHosifRqwK2zksJdWvERjQNIN7s4Xpb80Jl8qvmznDq3uAPgvUI+tZFT7N18fmq3GR9xkw0vIOLqK+XTXahGhPU5uiRSa3TslE/qYM93iEKzvVyJeaOVRtVh/Yrb9JhT5tLc+V/4iSyIW2ekjhh3u92n3aAWNEJVifk1jXNcS6V4LZXiARzX8osRdusOgvfqbiInu2r5nbt/64L3+R3jFjrxZA9i3C33rDVbbCvjttfW12p1khrB0k8M0tJ5gc7/4v5sWHkzat/wiwl2/MsIROADR0/ixSe/KPns8QSVvYkCqRVu6rf3E+glj0PHbhCF4Hlg3Fp2Wu1qjLmVMLya41qeAnaIxL0zX5Yw9vgT24cfXPrZMDd4gq2WD9Ao9NVG29dFqWWVcdyAWPxJTTYsYcYHf8sjf9hUV5A3/TKCHU1hyZZHJY8wlWYefCBDmw6XSvlgomAGQaWDeDKlP71faJ9YIqz2Y9yXMDyOce/Fph7kE5LbAtxydCe1boflE9cjs88he5e7V3/IlksH2aA8U8NgrKqmrQIiBYzbjeuv1ETyMZo6/sKqJ54grLINbzLaETPw/wHdgK5Cxe9XugAAAABJRU5ErkJggg=="
            alt="PAGASA"
            width={110}
            height={40}
            style={{ height: 42, width: "auto", objectFit: "contain", display: "block", background: "transparent" }}
          />
          <div style={{ width: 1, height: 38, background: "#D1D5DB", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "grid", placeItems: "center", color: "var(--brand)", flexShrink: 0 }}>
              <SentinelMark size={52} />
            </div>
            <div style={{ lineHeight: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
                  fontSize: "18px",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "#0B1220",
                  lineHeight: 1,
                }}
              >
                AWS Sentinel
              </div>
              <div
                style={{
                  fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
                  fontSize: "9.5px",
                  fontWeight: 600,
                  letterSpacing: "0.20em",
                  color: "#6B7280",
                  textTransform: "uppercase",
                  lineHeight: 1,
                  marginRight: "-0.20em",
                }}
              >
                ANOMALY DETECTOR
              </div>
            </div>
          </div>
        </div>

        {/* Bottom headline — pushed to bottom, significantly larger */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "40px 0 72px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
              fontSize: "48px",
              fontWeight: 800,
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
              color: "#0B1220",
            }}
          >
            Where numbers
            <br />
            become insight.
          </h2>
          <p
            style={{
              margin: "18px 0 0",
              fontSize: "16px",
              lineHeight: 1.55,
              color: "#6B7280",
              maxWidth: 380,
              fontWeight: 400,
            }}
          >
            Spatiotemporal detection for PAGASA’s AWS network — daily downsets, neighbor clustering, and LOF-flagged extremes.
          </p>
        </div>

        {/* Bottom subtle caption — no fake avatars / no trial */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8, fontSize: "11.5px", color: "#9CA3AF" }}>
          <span style={{ width: 28, height: 1, background: "#D1D5DB", display: "inline-block" }} />
          PAGASA · Department of Science and Technology
        </div>
      </div>

      {/* ── Right: dark panel — 50/50 on desktop, full width on mobile — darkblue like darkmode (surface #11151B) */}
      <div
        className="w-full md:w-1/2 md:basis-1/2 flex items-center justify-center"
        style={{
          minWidth: 0,
          background: "#11151B",
          padding: "32px 20px",
          position: "relative",
        }}
      >
        {/* Mobile logo — visible when left panel hidden — PAGASA first + Sentinel */}
        <div
          className="flex md:hidden"
          style={{
            position: "absolute",
            top: 20,
            left: 20,
            right: 20,
            alignItems: "center",
            gap: 10,
          }}
        >
          <img src="data:image/png;base64,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" alt="PAGASA" style={{ height: 30, width: "auto", objectFit: "contain", display: "block", filter: "brightness(0) invert(1)" }} />
          <div style={{ width: 1, height: 28, background: "#1F2530", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "grid", placeItems: "center", color: "#4D9CFF", flexShrink: 0 }}>
              <SentinelMark size={42} />
            </div>
            <div style={{ lineHeight: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "-0.02em", color: "#F3F5F8" }}>AWS Sentinel</div>
              <div style={{ fontSize: "8.5px", fontWeight: 600, letterSpacing: "0.18em", color: "#9CA3AF", textTransform: "uppercase", marginRight: "-0.18em" }}>
                ANOMALY DETECTOR
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: "min(380px, 100%)", marginTop: 8 }}>
          {/* Heading */}
          <div style={{ marginBottom: 22 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
                fontSize: "20px",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#FFFFFF",
                lineHeight: 1.2,
              }}
            >
              Welcome back
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: "13.5px", color: "#9CA3AF", lineHeight: 1.5 }}>
              Sign in to your AWS Sentinel workspace.
            </p>
          </div>

          {/* Google button — dark style like Acme */}
          {GOOGLE_OAUTH_ENABLED && (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading || isLocked}
                style={{
                  width: "100%",
                  height: 42,
                  borderRadius: 10,
                  border: "1px solid #1F2530",
                  background: "#161B22",
                  color: "#F4F4F5",
                  fontSize: "13.5px",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  cursor: loading || isLocked ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: loading || isLocked ? 0.6 : 1,
                  transition: "background 0.12s ease, border-color 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  if (!loading && !isLocked) (e.currentTarget as HTMLElement).style.background = "#1F2530";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#161B22";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden style={{ flexShrink: 0 }}>
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                Continue with Google
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  margin: "16px 0",
                  color: "#71717A",
                  fontSize: "11px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ flex: 1, height: 1, background: "#1F2530" }} />
                OR
                <span style={{ flex: 1, height: 1, background: "#1F2530" }} />
              </div>
            </>
          )}

          {/* Form — Acme dark style */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: "12.5px", fontWeight: 500, color: "#E4E4E7" }}>Email</label>
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
                  height: 42,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: `1px solid ${error ? "#7F1D1D" : "#1F2530"}`,
                  background: "#0D1117",
                  color: "#FAFAFA",
                  fontSize: "13.5px",
                  outline: "none",
                  transition: "border-color 0.12s ease, background 0.12s ease",
                  opacity: loading ? 0.6 : 1,
                  fontFamily: "inherit",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = error ? "#DC2626" : "#2A3140";
                  e.currentTarget.style.background = "#161B22";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = error ? "#7F1D1D" : "#1F2530";
                  e.currentTarget.style.background = "#0D1117";
                }}
              />
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: "12.5px", fontWeight: 500, color: "#E4E4E7" }}>Password</label>
                {/* Intentionally no Forgot? link — not implemented */}
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: 42,
                    paddingLeft: 12,
                    paddingRight: 40,
                    borderRadius: 10,
                    border: `1px solid ${error ? "#7F1D1D" : "#1F2530"}`,
                    background: "#0D1117",
                    color: "#FAFAFA",
                    fontSize: "13.5px",
                    outline: "none",
                    transition: "border-color 0.12s ease, background 0.12s ease",
                    opacity: loading ? 0.6 : 1,
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = error ? "#DC2626" : "#2A3140";
                    e.currentTarget.style.background = "#161B22";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = error ? "#7F1D1D" : "#1F2530";
                    e.currentTarget.style.background = "#0D1117";
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
                    color: "#A1A1AA",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error / lockout — dark variant */}
            {error && (
              <div
                className="animate-fade-in"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#1F1313",
                  border: "1px solid #3F1A1A",
                }}
              >
                {isLocked ? (
                  <Lock size={14} style={{ color: "#F87171", flexShrink: 0, marginTop: 1 }} />
                ) : (
                  <AlertCircle size={14} style={{ color: "#F87171", flexShrink: 0, marginTop: 1 }} />
                )}
                <div>
                  <p style={{ margin: 0, fontSize: "13px", color: "#FECACA", lineHeight: 1.4 }}>{error}</p>
                  {isLocked && (
                    <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#F87171", fontVariantNumeric: "tabular-nums" }}>
                      Unlocks in {lockedFor}s
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Submit — white like Acme */}
            <button
              type="submit"
              disabled={loading || isLocked || !credential.trim() || !password}
              style={{
                marginTop: 6,
                width: "100%",
                height: 42,
                borderRadius: 10,
                border: "1px solid #FFFFFF",
                background:
                  loading || isLocked || !credential.trim() || !password ? "#1F2530" : "#FFFFFF",
                color: loading || isLocked || !credential.trim() || !password ? "#A1A1AA" : "#0A0A0A",
                fontSize: "13.5px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: loading || isLocked || !credential.trim() || !password ? "not-allowed" : "pointer",
                transition: "all 0.12s ease",
                fontFamily: "inherit",
              }}
            >
              {loading ? (
                <>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid rgba(0,0,0,0.2)",
                      borderTopColor: "#0A0A0A",
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
                "Sign in"
              )}
            </button>
          </form>

          {/* No trial / signup footer — intentionally omitted per spec */}
        </div>
      </div>
    </div>
  );
}
