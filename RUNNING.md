# Running the System

Three servers must run simultaneously. Start them in order: **API first**, then Web and App.

---

## Prerequisites

Make sure these are installed once before anything else:

```powershell
# API dependencies (from api/)
cd api
pip install -r requirements.txt
```

```powershell
# Web dependencies (from web/)
cd web
npm install
```

```powershell
# App dependencies (from App/)
cd App
npm install
```

---

## Terminal 1 — FastAPI Backend

```powershell
cd C:\Users\lynni\Repository\Spatiotemporal-Anomaly-Detection\api
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- Runs at: `http://localhost:8000`
- `--host 0.0.0.0` is required so your phone can connect to it over WiFi
- Leave this running. If you restart it, always include `--host 0.0.0.0`

---

## Terminal 2 — Next.js Web Dashboard

```powershell
cd C:\Users\lynni\Repository\Spatiotemporal-Anomaly-Detection\web
npm run dev
```

- Runs at: `http://localhost:3000`
- Open in browser for the analyst dashboard

---

## Terminal 3 — Expo Mobile App

```powershell
cd C:\Users\lynni\Repository\Spatiotemporal-Anomaly-Detection\App
npm start
```

- Press `w` to open in PC browser
- Scan the QR code with Expo Go on your phone (must be on same WiFi)

---

## Phone Testing

Your phone cannot reach `localhost` — it needs your PC's local IP.

`App/.env` is already configured with `http://192.168.100.10:8000`.

**Requirements:**
- PC and phone must be on the **same WiFi network**
- API must be started with `--host 0.0.0.0` (not the default)
- If your router assigns a new IP to your PC, update `App/.env` and restart Expo

To find your current IP if it changes:
```powershell
ipconfig | Select-String "IPv4"
```

---

## Quick Reference

| Server | Directory | Command | URL |
|--------|-----------|---------|-----|
| API | `api/` | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` | `http://localhost:8000` |
| Web | `web/` | `npm run dev` | `http://localhost:3000` |
| App | `App/` | `npm start` | `http://localhost:8081` |

---

## Troubleshooting

**Phone shows "Network request failed"**
- API is not running with `--host 0.0.0.0` — restart it with that flag
- Phone is not on the same WiFi as your PC
- PC IP changed — run `ipconfig`, update `App/.env`, restart Expo

**Web dashboard shows "Failed to fetch" / login loop**
- API is not running — start Terminal 1 first
- Check the API terminal for error output

**Expo Metro crash on startup**
- Run `npm install` in `App/` then retry

**CORS error in browser console**
- API is not running or was started without `--host 0.0.0.0`
- Restart the API server
