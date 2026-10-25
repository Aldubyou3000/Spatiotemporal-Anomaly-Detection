# USB Setup Guide — Run This Project on Another PC

> Simple guide to copy this project via USB and run it on a different computer.

---

## Will It Work If I Just Copy the Folder to USB?

**Yes — if you drag-and-drop the folder in File Explorer.**

File Explorer copies **every file**, including the hidden `.env` files. So nothing will be missing.

> `.gitignore` only hides `.env` from `git clone`. It does NOT hide them from a USB copy.

**The only things that break after copying are:**

1. `api/.venv/` — tied to your old PC path (`C:\Users\lynni\...`)
2. `web/node_modules/` and `App/node_modules/` — too big + may not work on new PC
3. `App/.env` — your old PC's WiFi IP changes on the new PC

All fixable in 5 minutes. Follow the steps below.

---

## What to Copy to USB

**Recommended: Delete these before copying to save ~1GB and avoid errors:**

Delete `api/.venv/`, `web/node_modules/`, `App/node_modules/`, `web/.next/`, `App/.expo/`

Then copy the rest. You will reinstall them on the new PC (takes 2-3 min).

If you already copied everything including them, just delete them on the new PC and reinstall — same result.

---

## On the New PC — Do This in Order

### Step 0: Install Prerequisites (once)

| Software | Version | Check |
|----------|---------|-------|
| Python | 3.10+ | `python --version` |
| Node.js | 20 LTS | `node --version` |
| Git | any | `git --version` |

If any command says "not recognized", install that software first.

### Step 1: Paste the Project From USB

Paste the folder anywhere, e.g. `C:\Users\NewUser\Documents\Spatiotemporal-Anomaly-Detection`

You can also do `git clone` instead of USB — but then you must recreate the 3 `.env` files (see Step 3).

### Step 2: Fix `.venv` (THE IMPORTANT PART)

**Why:** When you ran `python -m venv .venv` on the old PC, it hardcoded the path `C:\Users\lynni\...python.exe` inside `api/.venv/Scripts/Activate.ps1`. On a new PC with a different username or Python version, it will fail to activate or crash on `pandas` / `scikit-learn`.

**Fix: Always delete and recreate it on the new PC.**

```powershell
# 1. Delete old venv if you copied it
Remove-Item -Recurse -Force api\.venv

# 2. Create a fresh one for THIS PC
cd api
python -m venv .venv

# 3. Activate it
.\.venv\Scripts\Activate.ps1
# If PowerShell says "running scripts is disabled", run this ONCE then try again:
# Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned

# You should now see (.venv) at the start of your terminal line

# 4. Install Python packages
pip install --upgrade pip
pip install -r requirements.txt

# 5. Go back
cd ..
```

> Do NOT upgrade `pandas` or `scikit-learn` manually. The project needs `pandas>=2.2.0` and `scikit-learn>=1.4.0`.

### Step 3: Install Web & Mobile Dependencies

```powershell
# Web dashboard
cd web
npm install
cd ..

# Mobile app
cd App
npm install
cd ..
```

This takes 2-3 minutes. Do NOT upgrade Expo — it is pinned to `55.0.26`.

If you get "Cannot find module" errors later, delete `node_modules` and run `npm install` again.

### Step 4: Check Your 3 `.env` Files

If you pasted via USB, these files are already there. Just do one fix:

**Only file you MUST change: `App/.env`**

Your phone connects via your PC's WiFi IP, which changes on every PC/network.

```powershell
# Find your NEW PC's IP
ipconfig | Select-String "IPv4"
# Look for 192.168.x.x — e.g. 192.168.1.50
```

Then edit `App/.env`:
```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:8000
```
Replace with YOUR new IP. Leave `web/.env.local` as `http://localhost:8000`.

If you used `git clone` (no `.env` files), create them:

**`api/.env`** — ask your teammate for these values:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
SUPABASE_ANON_KEY=your_key
SUPABASE_JWT_SECRET=your_key
JWT_SECRET=your_key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=http://localhost:3000
DEV_MODE=true
CSRF_SECRET=your_key
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
GOOGLE_OAUTH_ENABLED=false
OAUTH_REDIRECT_BASE=http://localhost:8000
MOBILE_OAUTH_REDIRECT_BASE=
WEB_APP_URL=http://localhost:3000
```

**`web/.env.local`**:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**`App/.env`**:
```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
```

### Step 5: Start All 3 Servers (3 Terminals)

Start in this order and leave them all open:

**Terminal 1 — API (Backend):**
```powershell
cd api
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Wait for `Application startup complete`. Test: `http://localhost:8000/docs` should show API docs.
> Must be `--host 0.0.0.0` so your phone can connect. Never add `--workers` (breaks real-time).

**Terminal 2 — Web Dashboard:**
```powershell
cd web
npm run dev
```
Wait for `Local: http://localhost:3000`. Open it — you should see login page.

**Terminal 3 — Mobile App:**
```powershell
cd App
npm start
```
Wait for QR code. Press `w` for browser, or scan QR with **Expo Go** on phone (phone + PC must be on same WiFi).
> If you changed `App/.env`, use `npx expo start -c` (clears cache) instead.

---

## Optional: ngrok for Google Sign-In on Phone

**Skip this if you only use password login.** Password login works without ngrok.

Google login needs `https://` — your `http://192.168.x.x` is blocked by Chrome. ngrok gives you a free `https://` tunnel.

### One-Time Setup (do once):

1. Install ngrok: `winget install ngrok.ngrok` (or download from https://ngrok.com/download)
2. Get your free authtoken at https://dashboard.ngrok.com/get-started/your-authtoken and run:
   ```powershell
   ngrok config add-authtoken YOUR_TOKEN
   ```
3. Claim 1 free static domain at https://dashboard.ngrok.com/domains — e.g. `https://your-name.ngrok-free.dev`
4. Update 3 places with that URL:
   - `api/.env`: `MOBILE_OAUTH_REDIRECT_BASE=https://your-name.ngrok-free.dev`
   - `App/.env`: `EXPO_PUBLIC_API_URL=https://your-name.ngrok-free.dev`
   - Supabase Dashboard → Authentication → URL Configuration → Redirect URLs → Add:
     ```
     https://your-name.ngrok-free.dev/api/mobile/auth/oauth/google/callback/**
     ```
     (the `/**` at the end is required)

### Daily Use (Terminal 4):

You now need 4 terminals. Start 1-3 as above, plus:

**Terminal 4 — ngrok tunnel:**
```powershell
ngrok http --url=your-name.ngrok-free.dev 8000
```
Drop the `https://` — ngrok wants just `your-name.ngrok-free.dev`. Leave this window open.

Then start the mobile app with cache clear:
```powershell
cd App
npx expo start -c
```

> **Expo Go can't finish Google sign-in** — it can't handle the `spatiotemporal://` return link. For Google you need a dev build: `eas build --profile development --platform android` then `npx expo start --dev-client -c`. See `docs/NGROK_GOOGLE_SIGNIN_GUIDE.md` for full details.

---

## Verify It Works

- API: `http://localhost:8000/health` → `{"status":"ok"}`
- Web: `http://localhost:3000` → login page
- Phone browser: `http://YOUR_PC_IP:8000/health` → `{"status":"ok"}` (if this fails, it's firewall — see below)
- Change a ticket on one device → other device updates in ~1 second (real-time SSE)

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` then try again |
| `Module not found` (Python) | Is `(.venv)` showing in terminal? If not, activate. Then `pip install -r requirements.txt` |
| `Cannot find module` (Node) | Delete `node_modules`, run `npm install` again |
| Phone can't reach API | Same WiFi? `ipconfig` IP matches `App/.env`? Restart Expo with `-c`. Try phone browser → `http://PC_IP:8000/health` |
| Windows Firewall blocks phone | Allow Python when prompted. Or run as Admin: `New-NetFirewallRule -DisplayName "FastAPI 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private` |
| Changed `.env` but app still uses old IP | Stop Expo, run `npx expo start -c` |
| `ngrok http 8000` gives random URL | Must use `ngrok http --url=your-name.ngrok-free.dev 8000` with your static domain |

---

## Daily Startup Cheat Sheet

After setup, every day you just run:

```powershell
# Terminal 1 — API
cd api; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Web
cd web; npm run dev

# Terminal 3 — Mobile
cd App; npm start
# or if App/.env changed: npx expo start -c

# Terminal 4 — Only if testing Google sign-in on phone
ngrok http --url=configure-phoenix-rival.ngrok-free.dev 8000
```

Full docs: `SETUP_GUIDE.md`, `README.md`, `docs/NGROK_GOOGLE_SIGNIN_GUIDE.md`, `docs/KNOWN_BUGS_AND_FIXES.md`


If you do Explorer drag-drop of the whole folder (as you did), you already copied dependencies:
- pip deps are inside api/.venv/ (api/requirements.txt:1 already installed)
- npm deps are inside web/node_modules/ + App/node_modules/
So you don't need to pip install / npm install again if the new PC is also Windows + same Python 3.10+ + same Node 20 LTS.
Still need to do 2 things even with full copy:
1. Fix .venv if it fails — api/.venv/ hardcodes your old path C:\Users\lynni\...python.exe. On a PC with different username or Python version, .\.venv\Scripts\Activate.ps1 fails. Then delete + recreate:
Remove-Item -Recurse -Force api\.venv
cd api; python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
If activation works, you can skip reinstall.
2. Fix App/.env IP — change http://192.168.x.x:8000 to new PC's ipconfig IP, then npx expo start -c. Otherwise phone can't connect.
No copy needed for Prerequisites: new PC still needs Python + Node installed system-wide, but no npm install if node_modules was copied and works.