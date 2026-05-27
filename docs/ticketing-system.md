# Ticketing System Reference

This document covers the full lifecycle of a maintenance ticket — from creation by an analyst to field resolution by a technician and final approval — including how both systems (web dashboard and mobile app) interact with the backend at each stage.

---

## Roles

| Role | System | What they can do |
|------|--------|-----------------|
| **Analyst** | Web dashboard (Next.js) | Create tickets, reassign technicians, advance status, review reports, approve, download PDFs |
| **Technician** | Mobile app (Expo) | View assigned tickets, mark in-progress, submit inspection reports, upload photos, download PDFs |

---

## Ticket Lifecycle

```
[Analyst creates ticket]
        ↓
    assigned
        ↓  (technician marks in-progress via mobile)
   in-progress
        ↓  (technician submits inspection report — auto-transitions)
   completed
        ↓  (analyst approves report on web)
   verified
```

Every status transition is a `PATCH` call to the API. Only valid transitions are accepted — the backend enforces them.

### Status transition rules

| From | To | Who | How |
|------|----|-----|-----|
| *(new)* | `assigned` | Analyst | Ticket creation — always starts assigned |
| `assigned` | `in-progress` | Technician | `PATCH /api/mobile/tickets/{id}/status` |
| `in-progress` | `completed` | Technician | `POST /api/mobile/reports` — report submission auto-transitions |
| `completed` | `verified` | Analyst | `PATCH /api/reports/{report_id}/approve` |
| `completed/verified` | `assigned` | Analyst | Reassign via `PATCH /api/tickets/{id}` (sets new `assigned_at`) |

---

## Storage Buckets

Two separate Supabase Storage buckets are used. Signed URLs expire in 1 hour and are regenerated fresh on every fetch — never stored.

| Bucket | Contents | Uploaded by |
|--------|----------|-------------|
| `ticket-attachments` | CSV exports, reference PDFs, any analyst-uploaded files | Analyst (web) |
| `inspection-photos` | Field photos taken during inspection | Technician (mobile) |

---

## Data Tables

```
tickets
  └── ticket_attachments       (analyst uploads — references ticket)
  └── inspection_reports       (one per ticket — submitted by technician)
        └── inspection_photos  (multiple per report — uploaded by technician)
```

---

## API Endpoints

### Analyst endpoints (`/api/tickets`, `/api/reports`) — cookie auth

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tickets` | List all tickets (filterable by status, priority, station_id) |
| `POST` | `/api/tickets` | Create a ticket (always starts as `assigned`) |
| `GET` | `/api/tickets/{id}` | Get single ticket with technician details |
| `PATCH` | `/api/tickets/{id}` | Update title, description, priority, status, or reassign technician |
| `GET` | `/api/tickets/{id}/attachments` | List analyst-uploaded attachments with fresh signed URLs |
| `POST` | `/api/tickets/{id}/attachments` | Upload a file (CSV, PDF, etc.) — max 20 MB |
| `GET` | `/api/tickets/{id}/report` | Get inspection report + photos for a ticket (or `null`) |
| `GET` | `/api/tickets/{id}/pdf` | Stream a PDF of the ticket — sections vary by status |
| `GET` | `/api/reports` | List all inspection reports |
| `GET` | `/api/reports/{id}` | Get a single report |
| `GET` | `/api/reports/{id}/photos` | List inspection photos with fresh signed URLs |
| `PATCH` | `/api/reports/{id}/approve` | Approve report and set analyst remarks — transitions ticket to `verified` |

### Technician endpoints (`/api/mobile/tickets`, `/api/mobile/reports`) — Bearer token auth

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mobile/tickets` | List all tickets assigned to the authenticated technician |
| `GET` | `/api/mobile/tickets/{id}` | Get a single ticket (only if assigned to this technician) |
| `PATCH` | `/api/mobile/tickets/{id}/status` | Set status to `in-progress` or `completed` |
| `GET` | `/api/mobile/tickets/{id}/attachments` | List analyst-uploaded attachments with fresh signed URLs |
| `GET` | `/api/mobile/tickets/{id}/report-id` | Get full inspection report data for a ticket (or `null`) |
| `GET` | `/api/mobile/tickets/{id}/pdf` | Stream a PDF of the ticket |
| `POST` | `/api/mobile/reports` | Submit inspection report — also transitions ticket to `completed` |
| `GET` | `/api/mobile/reports/{id}/photos` | List inspection photos with fresh signed URLs |
| `POST` | `/api/mobile/reports/{id}/photos` | Upload a photo — max 10 MB, JPEG/PNG/WebP/HEIC only |

---

## Stage-by-Stage Flow

### Stage 1 — Analyst creates ticket (web)

The analyst identifies an anomaly from the zone pipeline results and creates a ticket on the web dashboard.

**Web calls:** `POST /api/tickets`

**Payload:**
```json
{
  "title": "...",
  "station_id": "...",
  "priority": "high",
  "anomaly_zone": "C",
  "anomaly_data": { "lof_score": -1.82, "rainfall": 120.5 },
  "technician_id": "...",
  "description": "..."
}
```

**Backend:** `tickets_service.create_ticket()` inserts a row with `status = "assigned"` and `assigned_at = now()`.

---

### Stage 2 — Technician views and starts ticket (mobile)

The technician logs in and sees the ticket in their active queue.

**Mobile calls:**
1. `GET /api/mobile/tickets` — fetches all assigned tickets, filtered client-side by status
2. `GET /api/mobile/tickets/{id}` — loads full detail when a ticket is opened
3. `PATCH /api/mobile/tickets/{id}/status` with `{ "status": "in-progress" }` — marks work started

**Mobile app filters:**
- **Active tab**: tickets with status `created` or `assigned`
- **In Progress tab**: tickets with status `in-progress`
- **History tab**: tickets with status `completed` or `verified`

---

### Stage 3 — Technician submits inspection report (mobile)

After completing the field visit, the technician fills out and submits an inspection report. This is the only way to transition a ticket to `completed`.

**Mobile calls:** `POST /api/mobile/reports`

**Payload:**
```json
{
  "ticket_id": "...",
  "notes": "Sensor housing cracked, water ingress visible.",
  "sensor_working": false,
  "severity": "high",
  "root_cause": "Physical damage from recent storm."
}
```

**Backend behaviour:**
- Inserts a row into `inspection_reports`
- Immediately patches the ticket: `status = "completed"`, `completed_at = now()`
- If a report already exists for that ticket, returns the existing one (idempotent — no duplicate reports)
- Race conditions handled: duplicate key errors are caught and the existing row returned

**Photo upload (optional, separate call):**
`POST /api/mobile/reports/{report_id}/photos` — multipart form-data, field name `photo`.
Photos are stored in the `inspection-photos` bucket as `{report_id}/{timestamp}.{ext}`.
The raw storage path (not a signed URL) is stored in `inspection_photos.photo_url` so fresh signed URLs can always be generated.

---

### Stage 4 — Analyst reviews and approves (web)

The analyst sees the completed ticket appear in the Reports tab and reviews the technician's submission.

**Web calls:**
1. `GET /api/reports` — lists all reports
2. `GET /api/tickets/{id}/report` — fetches full report + photos with signed URLs for the detail panel
3. `PATCH /api/reports/{id}/approve` — approves with optional remarks

**Approval payload:**
```json
{
  "analyst_notes": "Confirmed sensor replacement required. Escalate to procurement."
}
```

**Backend:** Sets `analyst_approved = true`, `analyst_approved_at = now()`, `analyst_notes`, and transitions the ticket to `verified` (sets `verified_at`).

---

## PDF Export

Both roles can download a PDF of a ticket. The content rendered depends on the ticket's current status.

| Section | Condition |
|---------|-----------|
| Ticket Details (ID, station, status, priority, assigned to, timestamps) | Always |
| Description | Always, if present |
| Anomaly Data | Always, if present |
| Inspection Report (submitted date, technician, sensor working, severity) | When a report exists |
| Field Observations | When `notes` is present on the report |
| Root Cause | When `root_cause` is present on the report |
| Analyst Remarks (approved by, approved at, remarks text) | `verified` status only |

The meta table also conditionally includes the `Completed` and `Verified` timestamp rows only when the ticket has reached those statuses.

**Analyst PDF endpoint:** `GET /api/tickets/{id}/pdf` (cookie auth)
**Technician PDF endpoint:** `GET /api/mobile/tickets/{id}/pdf` (Bearer auth)

---

## Auth Boundaries

The two systems use different auth mechanisms. Neither frontend ever calls Supabase directly.

| Surface | Auth mechanism | Guard dependency |
|---------|---------------|-----------------|
| Web dashboard | httpOnly cookie (`access_token`) | `require_analyst` |
| Mobile app | `Authorization: Bearer <token>` header | `require_technician_mobile` |

Tokens are issued by `POST /api/mobile/auth/login` (mobile) or `POST /api/auth/login` (web). Access tokens expire in 30 minutes; refresh tokens last 7 days and rotate on every use.

A technician **cannot** access analyst endpoints, and an analyst **cannot** access mobile endpoints — the guard dependencies enforce role checks on every request.
