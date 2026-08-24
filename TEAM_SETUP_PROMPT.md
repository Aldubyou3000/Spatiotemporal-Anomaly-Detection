# Quick Setup Instructions for Team Members

Follow these steps in order after forking the repository.

---

## 1. Install Required Software

Install these if you don't have them:

- **Python 3.10+**: https://www.python.org/downloads/
- **Node.js 20 LTS**: https://nodejs.org/en/download/
- **Git**: https://git-scm.com/downloads

Verify installations:
```powershell
python --version
node --version
npm --version
```

---

## 2. Clone Your Fork

```powershell
git clone https://github.com/YOUR_USERNAME/Spatiotemporal-Anomaly-Detection.git
cd Spatiotemporal-Anomaly-Detection
```

---

## 3. Install Dependencies

```powershell
# API
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
cd ..

# Web
cd web
npm install
cd ..

# Mobile
cd App
npm install
cd ..
```

If PowerShell blocks activation, run once: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned`

---

## 4. Create Environment Files

**Ask the repo owner for:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_JWT_SECRET`
- `JWT_SECRET`
- `CSRF_SECRET`

### Create `api/.env`:

```env
SUPABASE_URL=<ask_repo_owner>
SUPABASE_SERVICE_ROLE_KEY=<ask_repo_owner>
SUPABASE_ANON_KEY=<ask_repo_owner>
SUPABASE_JWT_SECRET=<ask_repo_owner>
JWT_SECRET=<ask_repo_owner>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
CSRF_SECRET=<ask_repo_owner>
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
ALLOWED_ORIGINS=http://localhost:3000
DEV_MODE=true
GOOGLE_OAUTH_ENABLED=false
OAUTH_REDIRECT_BASE=http://localhost:8000
MOBILE_OAUTH_REDIRECT_BASE=
WEB_APP_URL=http://localhost:3000
```

### Create `web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Create `App/.env`:

First, find your PC's IP:
```powershell
ipconfig | Select-String "IPv4"
```

Then create the file (replace with your actual IP):
```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
```

---

## 5. Run All Servers (3 Terminals)

### Terminal 1 - API:
```powershell
cd api
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 2 - Web:
```powershell
cd web
npm run dev
```

### Terminal 3 - Mobile:
```powershell
cd App
npm start
```

---

## 6. Verify

- **API**: Open http://localhost:8000/docs
- **Web**: Open http://localhost:3000
- **Mobile**: Scan QR code with Expo Go (phone on same WiFi)

---

## Troubleshooting

- **Can't connect from phone**: Make sure PC and phone are on same WiFi, and `App/.env` has correct PC IP
- **Module not found**: Re-run `pip install -r requirements.txt` or `npm install`
- **Firewall blocks**: Allow Python/uvicorn when Windows prompts

For detailed help, see `SETUP_GUIDE.md` or `docs/KNOWN_BUGS_AND_FIXES.md`.
