# ngrok + Google Sign-In — Complete Setup Guide

This guide gets mobile Google sign-in working with a **permanent** https URL that you set up **once**
and never have to change again (unlike the old cloudflared tunnel that died on every restart).

> **Why you need this at all:** Google's login page runs inside Chrome on the phone. Chrome refuses
> to redirect from a real website (Google) back to a plain `http://` LAN address — it treats that as a
> security risk. So the API must be reachable over `https://`. A PC's LAN IP (`192.168.x.x`) can't be
> https on its own. ngrok wraps your local API in a real `https://yourname.ngrok-free.dev` address.
>
> Password login does NOT need this — only Google sign-in does. Password login works over plain LAN.

---

## What ngrok gives you (free tier)

- **One permanent URL** — e.g. `https://spatiotemporal.ngrok-free.dev`. Set it once, reuse forever.
- Free, no credit card.
- No "are you sure you want to visit this site?" interstitial page (which would break the OAuth flow).
- Works with your existing backend code **with zero code changes** — the API already auto-detects the
  ngrok host and builds the right callback URL (`_mobile_oauth_callback_url` in
  `api/app/routers/mobile.py` trusts the `Host` and `X-Forwarded-Proto` headers).

---

## PART 1 — One-time ngrok account setup (~10 min, do once ever)

### Step 1.1 — Create a free account
1. Go to https://dashboard.ngrok.com/signup
2. Sign up (Google/GitHub login is fine).

### Step 1.2 — Install ngrok on Windows
Open PowerShell and run:
```powershell
winget install ngrok.ngrok
```
If `winget` isn't available, download the Windows zip from https://ngrok.com/download, unzip it, and
put `ngrok.exe` somewhere on your PATH (e.g. `C:\Windows\System32` or a folder you've added to PATH).

Verify:
```powershell
ngrok version
```

### Step 1.3 — Connect your authtoken
1. On the ngrok dashboard, open **Your Authtoken** (https://dashboard.ngrok.com/get-started/your-authtoken).
2. Copy the token and run:
```powershell
ngrok config add-authtoken <PASTE_YOUR_TOKEN_HERE>
```
This is saved to your machine — you only do it once.

### Step 1.4 — Claim your free static domain
1. On the dashboard, go to **Domains** (https://dashboard.ngrok.com/domains).
2. Click **+ Create Domain** (or **+ New Domain**). The free tier gives you **one** static domain.
3. You'll get something like `https://spatiotemporal-abc123.ngrok-free.dev`.
4. **Copy this URL** — you'll paste it into 3 places below. This URL never changes.

> Write your domain down. Everything below uses `<YOUR_NGROK_URL>` as a placeholder — replace it with
> your real domain (e.g. `https://spatiotemporal-abc123.ngrok-free.dev`).

---

## PART 2 — Point your config at the ngrok URL (one-time, do once)

You update **3 places**. (One of them — the API auto-callback — needs nothing because the code reads
the live Host header, but we still set the env var as a safe fallback.)

### Place 1 — `api/.env`
Change this line to your ngrok URL:
```
MOBILE_OAUTH_REDIRECT_BASE=<YOUR_NGROK_URL>
```
Leave `GOOGLE_OAUTH_ENABLED=true` as-is. Leave `OAUTH_REDIRECT_BASE` and `WEB_APP_URL` on localhost
(those are for the **web** dashboard, which doesn't need the tunnel).

### Place 2 — `App/.env`
Change the whole value to your ngrok URL:
```
EXPO_PUBLIC_API_URL=<YOUR_NGROK_URL>
```
(This makes the phone send ALL its API traffic through ngrok, which is what makes the https callback
work. Password login on the phone will also go through ngrok — that's fine.)

### Place 3 — Supabase Redirect URLs (in the Supabase dashboard)
1. Open your Supabase project → **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, click **Add URL** and add **exactly** this (note the `/**` glob at the end):
   ```
   <YOUR_NGROK_URL>/api/mobile/auth/oauth/google/callback/**
   ```
   Example:
   ```
   https://spatiotemporal-abc123.ngrok-free.dev/api/mobile/auth/oauth/google/callback/**
   ```
3. Click **Save**.

> The `/**` at the end is required — the OAuth `state` value is appended as a path segment
> (`…/callback/<state>`), and the `**` glob matches it. Without `/**`, Supabase rejects the redirect
> and falls back to localhost. (This was a real bug we already fixed — see KNOWN_BUGS_AND_FIXES.md.)

---

## PART 3 — Daily run order (every time you want to test)

You now have **4 terminals**. Start them in this order:

### Terminal 1 — API
```powershell
cd api
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2 — ngrok (the tunnel)
```powershell
ngrok http --url=<YOUR_NGROK_URL> 8000
```
Replace `<YOUR_NGROK_URL>` with your domain but **drop the `https://`** — ngrok wants just the
hostname here. Example:
```powershell
ngrok http --url=spatiotemporal-abc123.ngrok-free.dev 8000
```
You'll see a "Session Status: online" screen. Leave this window open while testing.

> **Quick check:** open `<YOUR_NGROK_URL>/health` in your PC browser — should return `{"status":"ok"}`.

### Terminal 3 — Web dashboard (optional, only if you're working on the web side)
```powershell
cd web
npm run dev
```

### Terminal 4 — Mobile app
```powershell
cd App
npx expo start -c
```
The `-c` clears the cache so the new `EXPO_PUBLIC_API_URL` is picked up. **Always use `-c` after
changing `App/.env`.**

---

## PART 4 — Which app build can actually complete Google sign-in?

This is the catch. **Expo Go cannot finish Google sign-in** — it can't register the
`spatiotemporal://` deep link the OAuth flow returns through. You need a **dev build (APK)**:

```powershell
cd App
eas build --profile development --platform android
```
Install the resulting APK on the phone, then run the app with:
```powershell
npx expo start --dev-client -c
```

- **Password login** works fine in plain Expo Go — you only need the dev build for **Google** sign-in.
- For real technicians later, a production build (`eas build --profile production`) is what they install.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Phone browser shows "site can't be reached" | App still pointing at old/localhost URL | Update `App/.env`, restart with `npx expo start -c` |
| After Google consent, lands on `localhost:3000` | Supabase Redirect URL missing or wrong | Add `<YOUR_NGROK_URL>/api/mobile/auth/oauth/google/callback/**` (with `/**`) and Save |
| ngrok says "domain not found" or auth error | authtoken not set, or domain typo | Re-run `ngrok config add-authtoken …`; copy domain exactly from dashboard |
| `/health` over ngrok times out | API (Terminal 1) not running, or ngrok pointing at wrong port | Confirm uvicorn is on 8000 and ngrok command ends in `8000` |
| Google works but app shows "This screen doesn't exist" briefly | Known, harmless | Already handled — it redirects to home instantly |
| Sign-in hangs forever on Android after consent | Known Expo bug | Already worked around in code (deep-link listener races the browser promise) |

---

## When you go live (future — not now)

ngrok is the **testing-phase** solution. When you deploy for real users:
- API → **Railway** (must run ONE worker — the SSE broker is in-process). Add an `api/Procfile`,
  set `DEV_MODE=false` + all prod env vars (or `assert_production_safe()` refuses to boot).
- Web → **Vercel**.
- App → **EAS production build** with the permanent Railway URL baked in.

At that point you stop using ngrok entirely — the Railway URL replaces it in all 3 config spots above.
See `~/.claude/plans/i-wanna-integrate-proper-crystalline-spring.md` for the full deploy plan.
