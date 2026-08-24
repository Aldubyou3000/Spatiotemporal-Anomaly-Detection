# Complete Setup Guide for New Team Members

This guide walks you through setting up the entire Spatiotemporal Anomaly Detection project from scratch after forking the repository.

---

## What You'll Be Running

This project has **3 servers** that must run simultaneously:

1. **API (FastAPI)** — Backend server on port 8000
2. **Web Dashboard (Next.js)** — Analyst interface on port 3000
3. **Mobile App (Expo)** — Technician app on port 8081

Plus **optional 4th terminal** for ngrok (only needed for mobile Google sign-in).

---

## Step 1: Prerequisites & Installation

### Required Software

Install these before starting:

| Software | Version | Download Link | Check Command |
|----------|---------|---------------|---------------|
| Git | Any recent | https://git-scm.com/downloads | `git --version` |
| Python | 3.10+ | https://www.python.org/downloads/ | `python --version` |
| Node.js | 20 LTS | https://nodejs.org/en/download/ | `node --version` |
| npm | Comes with Node | — | `npm --version` |

### Optional Software

| Software | When Needed | Download Link |
|----------|-------------|---------------|
| Expo Go app | Basic mobile testing (password login only) | App Store / Play Store |
| ngrok | Mobile Google sign-in | https://ngrok.com/download |

### Quick Version Check

Open PowerShell and run:

```powershell
python --version
node --version
npm --version
git --version
```

All should return version numbers. If any command fails, install that software first.

---

## Step 2: Clone Your Fork

```powershell
# Navigate to where you want the project
cd C:\Users\YourName\Documents

# Clone your forked repo (replace YOUR_USERNAME)
git clone https://github.com/YOUR_USERNAME/Spatiotemporal-Anomaly-Detection.git

# Enter the project
cd Spatiotemporal-Anomaly-Detection
```

---

## Step 3: Install Dependencies

Run these commands **in order** from the repository root:

### API Dependencies (Python)

```powershell
# Go to API folder
cd api

# Create virtual environment
python -m venv .venv

# Activate it (if this fails, see note below)
.\.venv\Scripts\Activate.ps1

# Upgrade pip
pip install --upgrade pip

# Install all packages
pip install -r requirements.txt

# Go back to root
cd ..
```

**If PowerShell blocks script execution**, run this **once** in your PowerShell terminal:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```
Then try activating again.

### Web Dependencies (Node.js)

```powershell
cd web
npm install
cd ..
```

This takes 2-3 minutes. Wait for it to complete.

### Mobile Dependencies (Node.js)

```powershell
cd App
npm install
cd ..
```

---

## Step 4: Get Supabase Credentials

**Ask your teammate (the repo owner) for these values:**

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `SUPABASE_ANON_KEY`
4. `SUPABASE_JWT_SECRET`
5. `JWT_SECRET`
6. `CSRF_SECRET`

**Security note:** Never commit `.env` files or share these values publicly.

---

## Step 5: Create Environment Files

### File 1: `api/.env`

Create a new file at `api/.env` (not `api/.env.example`, exactly `api/.env`):

```env
# Supabase credentials (get these from your teammate)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here

# JWT settings (get JWT_SECRET and CSRF_SECRET from teammate)
JWT_SECRET=your_jwt_secret_here
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# Security
CSRF_SECRET=your_csrf_secret_here
COOKIE_SECURE=false
COOKIE_SAMESITE=lax

# CORS
ALLOWED_ORIGINS=http://localhost:3000
DEV_MODE=true

# Google OAuth (set to false for now, enable later if needed)
GOOGLE_OAUTH_ENABLED=false
OAUTH_REDIRECT_BASE=http://localhost:8000
MOBILE_OAUTH_REDIRECT_BASE=
WEB_APP_URL=http://localhost:3000
```

**Replace all `your_*_here` placeholders** with the actual values from your teammate.

### File 2: `web/.env.local`

Create `web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

This file is simple — just copy it exactly.

### File 3: `App/.env`

**Find your PC's LAN IP first:**

```powershell
ipconfig | Select-String "IPv4"
```

Look for a line like `IPv4 Address. . . . . . . . . . . : 192.168.x.x`. Copy that IP address.

Create `App/.env` and replace `<YOUR_PC_LAN_IP>`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
```

**Example:** If your IP is `192.168.1.100`, the line becomes:
```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
```

**Why not localhost?** Your phone is a separate device on the network — it can't reach `localhost` (which means "this device"). It needs your PC's actual network address.

---

## Step 6: Database Migrations (Check First!)

**Ask your teammate:** "Has someone already run the database migrations?"

- **If YES:** Skip this step entirely. The database is ready.
- **If NO or unsure:** Ask for access to the Supabase SQL editor, then continue below.

### Running Migrations Manually

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Open and execute these files **in order**:
   - `docs/migrations/0001_security_hardening.sql`
   - `docs/migrations/0002_audit_log_full.sql`
   - `docs/migrations/0003_ticket_number.sql`
   - `docs/migrations/0004_report_follow_up_notes.sql`
   - `docs/migrations/0005_lockdown_rpc_grants.sql`

Each file can be copy-pasted into the editor and run. They're safe to re-run (idempotent).

---

## Step 7: Start All Servers

You need **3 PowerShell windows** open simultaneously. Start them in this order:

### Terminal 1: API Server

```powershell
cd C:\Users\YourName\Documents\Spatiotemporal-Anomaly-Detection\api
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Wait for:** `Application startup complete` message.

**Test it:** Open http://localhost:8000/docs in your browser — you should see the FastAPI documentation page.

### Terminal 2: Web Dashboard

```powershell
cd C:\Users\YourName\Documents\Spatiotemporal-Anomaly-Detection\web
npm run dev
```

**Wait for:** `Local: http://localhost:3000` message.

**Test it:** Open http://localhost:3000 — you should see a login page.

### Terminal 3: Mobile App

```powershell
cd C:\Users\YourName\Documents\Spatiotemporal-Anomaly-Detection\App
npm start
```

**Wait for:** A QR code appears in the terminal.

**Test it:** 
- Press `w` to open in web browser, OR
- Scan the QR code with **Expo Go** app on your phone (phone must be on same WiFi as PC)

---

## Step 8: Verify Everything Works

### Test the API
- Open http://localhost:8000/docs
- Should show FastAPI Swagger documentation

### Test the Web Dashboard
- Open http://localhost:3000
- Should show login page
- Try logging in with credentials your teammate provides

### Test the Mobile App
- Scan QR code with Expo Go (phone on same WiFi)
- Should show login screen
- Try password login (Google login requires extra setup — see Step 9)

### Test Real-Time Sync
1. Open web dashboard on your PC
2. Open mobile app on your phone
3. Make a change on one device (e.g., update a ticket)
4. Other device should update automatically within 1-2 seconds

---

## Step 9: Mobile Google Sign-In (Optional — Advanced)

**Skip this section** if you only need password login. Mobile Google sign-in requires extra setup with ngrok.

### Why is this needed?

Google's OAuth flow requires an **HTTPS** callback URL. Your PC's local IP (`192.168.x.x`) is plain HTTP, which Chrome blocks during the OAuth redirect. ngrok gives you a free HTTPS tunnel.

### Full ngrok Setup

Follow the complete guide here: [docs/NGROK_GOOGLE_SIGNIN_GUIDE.md](docs/NGROK_GOOGLE_SIGNIN_GUIDE.md)

**Quick summary:**
1. Create free ngrok account → get authtoken
2. Claim one free static domain (e.g., `https://yourname.ngrok-free.dev`)
3. Update 3 config spots (api/.env, App/.env, Supabase Redirect URLs)
4. Run ngrok in Terminal 4: `ngrok http --url=yourname.ngrok-free.dev 8000`
5. Build a dev client (Expo Go can't handle deep links): `eas build --profile development --platform android`

**Password login does NOT need ngrok** — it works over plain HTTP/LAN.

---

## Daily Workflow (After Initial Setup)

Once everything is configured, your daily startup is just:

```powershell
# Terminal 1 (API)
cd api && .\.venv\Scripts\Activate.ps1 && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 (Web)
cd web && npm run dev

# Terminal 3 (Mobile)
cd App && npm start

# Terminal 4 (Optional — only for mobile Google sign-in)
ngrok http --url=yourname.ngrok-free.dev 8000
```

Leave all terminals running while you work.

---

## Troubleshooting

### "Module not found" errors in API
- Make sure virtual environment is activated (you should see `(.venv)` in terminal prompt)
- Re-run: `pip install -r requirements.txt`

### "Cannot find module" in Web or App
- Delete `node_modules/` folder
- Re-run: `npm install`

### API starts but Web can't connect
- Check `web/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:8000`
- Verify API is running (check Terminal 1)
- Test http://localhost:8000/health in browser — should return `{"status":"ok"}`

### Phone app can't connect to API
- **Verify same WiFi:** PC and phone must be on the same WiFi network
- **Check IP address:** Run `ipconfig | Select-String "IPv4"` and compare to `App/.env`
- **Update if IP changed:** If your PC's IP changed, update `App/.env` and restart Expo with `npm start -- -c` (the `-c` clears cache)
- **Test the URL:** On your phone's browser, open `http://YOUR_PC_IP:8000/health` — if this times out, your firewall is blocking it

### Firewall blocking connections
Windows Firewall might block uvicorn. When you first start the API, Windows should prompt "Allow access?" — click **Allow**. If you accidentally blocked it:
1. Open **Windows Defender Firewall** → **Allow an app**
2. Find **Python** or **uvicorn**
3. Check **Private** and **Public** boxes

### Database errors ("relation does not exist")
- Migrations weren't run. Go back to Step 6 and run all migration SQL files in Supabase.

### Web dashboard stuck loading / blank page
- Check browser console (F12) for errors
- Verify API is running and reachable
- Check `web/.env.local` is correct

---

## Important Notes

### Don't Upgrade These

- **Expo:** Pinned to v55.0.26 — do NOT upgrade to v56+ (breaking changes)
- **pandas:** Must be 2.2.0+ (earlier versions lack `limit_area` parameter)
- **scikit-learn:** Must be 1.4.0+ (LOF API changed)

### Never Modify

- Files in `api/app/zones/` — zone algorithms are the canonical source of truth, do not edit the logic

### Git Workflow

- Never commit `.env` files (they're in `.gitignore`)
- Pull from the original repo regularly: `git pull upstream main`
- Push to your fork: `git push origin your-branch-name`

---

## Quick Reference

### Start Commands

| Component | Command | URL |
|-----------|---------|-----|
| API | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` | http://localhost:8000 |
| Web | `npm run dev` | http://localhost:3000 |
| Mobile | `npm start` | http://localhost:8081 |
| ngrok | `ngrok http --url=yourname.ngrok-free.dev 8000` | https://yourname.ngrok-free.dev |

### File Locations

| File | Purpose |
|------|---------|
| `api/.env` | Backend secrets (never commit) |
| `web/.env.local` | Web API URL (never commit) |
| `App/.env` | Mobile API URL (never commit) |
| `docs/migrations/` | SQL migration files |
| `CLAUDE.md` | Full architecture details |
| `TECHSTACK.md` | Stack & API endpoints |

---

## Getting Help

1. **Check existing docs:**
   - [KNOWN_BUGS_AND_FIXES.md](docs/KNOWN_BUGS_AND_FIXES.md) — common issues and solutions
   - [NGROK_GOOGLE_SIGNIN_GUIDE.md](docs/NGROK_GOOGLE_SIGNIN_GUIDE.md) — mobile OAuth setup
   - [CLAUDE.md](CLAUDE.md) — architecture deep-dive

2. **Ask your teammate** — the person who forked this to you

3. **Check the error message** — often tells you exactly what's missing

---

## Next Steps After Setup

Once everything runs:

1. **Explore the web dashboard** — try uploading a CSV (sample data in `test-data/`)
2. **Run the zone pipeline** — see anomaly detection in action
3. **Create a test ticket** — assign it to a technician
4. **Test mobile app** — submit a report with photos
5. **Review the report** — approve it from the web dashboard
6. **Watch real-time sync** — changes appear instantly on both devices

---

Good luck! If you get stuck on any step, refer to the detailed docs or ask your teammate.
