# Known Bugs and Fixes

A running log of real bugs encountered during development — what caused them, how they were fixed,
and how to prevent them. Written in plain language so anyone can understand without reading the code.

---

## 1. Mobile OAuth / Google Sign-In

### Bug: "This site can't be reached — localhost refused to connect" on the phone
**Symptom:** Tapping "Continue with Google" on the phone opens a browser that immediately shows
"localhost refused to connect" without even reaching Google.

**Root cause:** The mobile app was using `http://localhost:8000` as the API address instead of the
PC's LAN IP (`http://192.168.100.10:8000`). This happened when Metro was started before `App/.env`
existed, or when Expo Go cached a stale bundle. `localhost` on a phone means the phone itself, not
the PC — so the request went nowhere.

**Fix:** Always start Metro with a cleared cache after changing `.env`:
```powershell
npx expo start -c
```
Make sure `App/.env` contains `EXPO_PUBLIC_API_URL=http://192.168.100.10:8000` (or the tunnel URL).

**How to prevent:** The app now logs `[api] API_URL = ...` at startup and shows a loud error if a
physical device is running against localhost. Check the Metro console on first launch.

---

### Bug: Phone can reach the API but Google sign-in still fails with "localhost:3000"
**Symptom:** After Google consent, the phone's browser redirects to `localhost:3000` ("refused to
connect") instead of returning to the app.

**Root cause (1) — Windows Firewall blocked port 8000:** The phone could not reach the API at all.
Windows Firewall had no inbound rule for TCP 8000. Password login was also broken.

**Fix:** Run once in an Administrator PowerShell:
```powershell
New-NetFirewallRule -DisplayName "FastAPI Dev 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
```

**Root cause (2) — Chrome blocks `http://` LAN hops mid-OAuth:** Even with the firewall open,
Google's login page runs inside Chrome. Chrome refuses to redirect from a real website (Google)
back to a plain `http://` LAN address (`http://192.168.100.10:8000`) — it treats this as a security
risk ("cleartext private network access"). The API needs to be reachable over `https://` for the
OAuth callback.

**Fix:** Use a tunnel that provides an `https://` address. We use cloudflared:
```powershell
cloudflared tunnel --url http://localhost:8000
```
Then update `App/.env` (`EXPO_PUBLIC_API_URL`) and `api/.env` (`MOBILE_OAUTH_REDIRECT_BASE`) with
the tunnel URL. Also add the tunnel URL to Supabase Redirect URLs.

**Permanent fix (future):** Deploy the API to a real https host (Railway, Render, etc.). No tunnel
needed, works from anywhere.

---

### Bug: Supabase ignores the mobile callback URL and falls back to Site URL (localhost:3000)
**Symptom:** Supabase auth logs show zero mobile callback hits. The browser always redirects to
`localhost:3000` (the Supabase Site URL) after Google consent, never to the mobile callback.

**Root cause:** The backend was appending `?state=<random>` to the `redirect_to` URL it sent to
Supabase. Supabase matches `redirect_to` against its Redirect URLs allowlist using glob patterns,
and a trailing `**` does NOT reliably span a literal `?` query character. So the URL failed to
match → Supabase fell back to its Site URL.

**Fix:** Moved the state correlator from a query param to a URL **path segment**:
- Backend now builds `redirect_to = f"{callback_url}/{state}"` (no `?state=`)
- Callback routes became path-parameterised: `/callback/{state}`
- Supabase Redirect URLs use `/callback/**` (the `**` glob spans path separators cleanly)

**Key lesson:** Never put variable/random content in the query string of a Supabase `redirect_to`.
Put it in the path, or don't put it there at all (Supabase manages its own OAuth state).

---

### Bug: Expo Go cannot complete Google sign-in (deep link never returns to app)
**Symptom:** Google consent completes, but the app never receives the callback. The browser sheet
stays open or closes with no result.

**Root cause:** Expo Go cannot register custom URL schemes (`spatiotemporal://`). The OAuth flow
returns tokens via a deep link (`spatiotemporal://oauth-callback#access_token=...`), but Expo Go
cannot handle this scheme — only a real built app can.

**Fix:** Build a development APK via EAS:
```powershell
eas build --profile development --platform android
```
Install the APK on the phone. The dev build registers the `spatiotemporal://` scheme and handles
the deep link correctly. Use `npx expo start --dev-client` instead of plain `expo start`.

**Permanent fix:** A production EAS build (`eas build --profile production`) is what real
technicians install.

---

### Bug: `openAuthSessionAsync` hangs on Android and never resolves
**Symptom:** On Android, after Google consent, `WebBrowser.openAuthSessionAsync` never resolves
(the browser closes but the Promise stays pending forever). The app appears to hang.

**Root cause:** Known Expo bug on Android — `openAuthSessionAsync` does not resolve when the app
returns via a custom-scheme deep link on some Android versions (expo/expo issues #13754, #34187).

**Fix:** Added a `Linking.addEventListener('url', ...)` listener that races against the browser
Promise. Whichever fires first wins. This captures the deep link return even when the browser
session Promise never resolves.

**File:** `App/services/api.ts` — `apiLoginWithGoogle()`

---

### Bug: "This screen doesn't exist" / 404 after Google sign-in
**Symptom:** After successful Google sign-in, the app briefly shows "This screen doesn't exist.
Go to Home screen." before landing on the home screen.

**Root cause:** The deep link `spatiotemporal://oauth-callback` routes Expo Router to the
`/oauth-callback` path, which didn't exist as a route file.

**Fix:** Created `App/app/oauth-callback.tsx` — a bare route that immediately redirects to `/`.
Also added `<Stack.Screen name="oauth-callback" options={{ headerShown: false, animation: 'none' }}>`
so the screen is invisible.

---

## 2. Network / Environment

### Bug: Phone cannot reach the API despite being on the same WiFi
**Symptom:** The phone times out or shows "connection refused" when trying to connect to the API.
Password login doesn't work either.

**Root cause:** Windows Firewall blocks inbound connections to port 8000. Uvicorn listens on all
interfaces (`0.0.0.0:8000`) but the firewall drops the packets before they reach uvicorn. Metro's
port 8081 works because Expo creates a firewall rule automatically on first run — uvicorn doesn't.

**Fix:** See firewall rule command above (Section 1, "Root cause (1)").

**Verify:** From the phone's browser, open `http://192.168.100.10:8000/health` — should return
`{"status":"ok"}`.

---

### Bug: App has stale bundle / `.env` changes don't take effect
**Symptom:** `App/.env` was changed but the app still uses the old value (e.g., still hitting
localhost after updating the API URL).

**Root cause:** Expo reads `.env` only when Metro starts. If Metro was already running, or Expo Go
cached a previous bundle, the new value never loads.

**Fix:**
```powershell
# Stop Metro, then:
npx expo start -c   # -c clears the bundle cache
```
Also shake the phone → "Reload" in Expo Go, or reinstall the dev build.

---

## 3. Security

### Bug: Raw Postgres error exposed to the client
**Symptom:** Creating a technician with a duplicate username shows a raw error like:
`{'message': 'duplicate key value violates unique constraint "profiles_username_key"', 'code': '23505', ...}`
in the UI.

**Root cause:** The router was directly passing the exception message (which contained the raw
Supabase/Postgres error) to `HTTPException(detail=...)`, which sent it to the browser/app.

**Fix:** Created `api/app/core/errors.py` — `friendly_db_error()` function that translates known
Postgres error codes (23505 unique violation, etc.) to human-readable messages and logs the raw
error server-side only. The client never sees internal database details.

**Rule:** Never do `raise HTTPException(detail=str(some_db_exception))`. Always translate first.

---

### Bug: Report submission leaked raw database error to the phone
**Symptom:** If a concurrent race condition hit during report insert, the phone received a response
containing the raw exception string.

**Root cause:** `detail=f"Failed to submit report: {err}"` where `err = str(exception)`.

**Fix:** Changed to `detail="Failed to submit report. Please try again."` and log the raw error
server-side: `logger.error("[mobile] report insert failed: %s", err)`.

**File:** `api/app/routers/mobile.py`

---

## 4. UI / UX

### Bug: Brief flash of "oauth-callback" screen after Google sign-in
**Symptom:** After successful Google sign-in, a brief white screen or "oauth-callback" text flashes
before landing on the home screen.

**Root cause:** Expo Router navigates to the `oauth-callback` route when the deep link fires. Even
though the route immediately redirects to `/`, there's a brief render between navigation and
redirect.

**Fix:** Added `options={{ headerShown: false, animation: 'none' }}` to the Stack.Screen for
`oauth-callback`. The screen renders with no header and no animation, making the transition
invisible. Accepted as "good enough" — no further polish needed.

---

### Bug: "Remember me" checkbox that did nothing
**Symptom:** The mobile login screen had a "Remember me" checkbox, but checking or unchecking it
had no effect — the app always kept the user signed in for 7 days regardless.

**Root cause:** The checkbox was added to the UI but was never wired up to any token TTL logic.
Tokens always persist in SecureStore with the same 7-day refresh window whether the box is checked
or not.

**Fix:** Removed the checkbox entirely. The correct behavior ("stay signed in like Facebook") is
now the implicit, always-on behavior. No confusing opt-in needed.

---

## 5. Data / API

### Bug: Random "Ticket not found" errors on the mobile app
**Symptom:** A technician taps a ticket that was just loaded in the list, and gets "Ticket not
found" — but the ticket exists and they're assigned to it.

**Root cause:** Transient network/fetch errors were being silently swallowed and returning `null`,
which overwrote the previously loaded ticket data. The ticket was never actually missing.

**Fix:** Wrapped API calls in typed error handling (`ApiError` with status code). Only a real HTTP
404 returns `null`; network errors throw so the UI can retry or show a proper error state. Added
retry logic for transient failures.

---

## 6. Code Quality Fixes (cleanup pass — 2026-06-21)

These were found during a codebase audit and fixed without changing any features:

| File | Issue | Fix |
|---|---|---|
| `api/app/routers/audit.py` | `import json` inside a for-loop (ran on every row) | Moved to top-level imports |
| `api/app/routers/audit.py` | Unused import `AuditLogEntry` | Removed |
| `api/app/routers/auth.py` | `import hmac` inside a function (ran on every CSRF check) | Moved to top-level imports |
| `api/app/routers/mobile.py` | `import ipaddress` and `from urllib.parse import urlparse` buried mid-file | Moved to top-level imports |
| `api/app/routers/mobile.py` | Unused import `AuthApiError` from supabase_auth | Removed |
| `api/app/routers/mobile.py` | Client IP extraction copy-pasted 6 times | Replaced with `_client_ip(request)` helper from `dependencies.py` |
| `api/app/routers/mobile.py` | Raw exception text in report submit error response | Replaced with generic message; raw error logged server-side only |

---

## Known Issues (documented, not fixed yet)

These are real but low-priority or require more significant work:

- **Attachment upload failure silent:** If a file attachment fails to upload when creating a ticket
  (`web/zones/page.tsx`), the user sees "Work order dispatched" with no indication the file didn't
  go through. Future fix: show a warning in the success message.

- **`detail=str(exc)` pattern is fragile:** Several auth endpoints pass `str(ValueError)` directly
  to `HTTPException.detail`. This is currently safe because the service layer only raises clean
  messages, but if a raw exception ever slips through, it would leak to the client. Future fix:
  always go through `friendly_db_error()` or a similar translator.

- **Token refresh has no retry on transient errors:** If the API is momentarily unavailable, a
  failed token refresh immediately shows "Session expired" even though the user's session is fine.
  Future fix: retry once with exponential backoff before prompting re-login.
