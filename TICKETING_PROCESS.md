# Ticketing System — Process & User Guide

**Last updated**: May 25, 2026 (all gaps from previous assessment resolved)

---

## Overview

Two user types drive the workflow. The data analyst operates from a browser (Streamlit). The technician operates from the mobile app (Expo Go).

```
Analyst (Web)
  ↓ detects anomaly → creates ticket → assigns to technician
Technician (Mobile)
  ↓ opens ticket → updates to in-progress → submits report + photo
Analyst (Web)
  ↓ reviews inspection report → approves → ticket verified ✓
```

---

## Ticket Status Flow

```
assigned → in-progress → completed → verified
```

| Status | Who sets it | What it means |
|---|---|---|
| `assigned` | Analyst (on creation) | Ticket dispatched, technician has not started yet |
| `in-progress` | Technician or Analyst | Technician is actively working on it |
| `completed` | Technician (on report submit) | Report submitted, awaiting analyst review |
| `verified` | Analyst (on report approval) | Fully closed and signed off |

Transitions are forward-only. The analyst can manually move `assigned → in-progress` and `in-progress → completed` if needed.

---

## Data Analyst — What They Can Do

### Access
Web browser (Streamlit app). Requires analyst credentials to sign in.

### Create a Ticket
A ticket can only be created after running the anomaly detection pipeline and anomalies are detected.

**To create a ticket:**
1. Upload a station CSV and click **Analyze Station Data**.
2. Once anomalies appear, go to the **Create Ticket** tab.
3. Fill in all fields:

| Field | Required | Notes |
|---|---|---|
| Assign to technician | Yes | Select from active technician accounts |
| Station ID | Yes | Pre-populated from flagged stations only |
| Anomaly Zone | Yes | A, B, or C (or — if unspecified) |
| Ticket title | Yes | 3–100 characters |
| Description | No | Detailed instructions for the technician |
| Priority | Yes | Low / Medium / High |

4. Click **Create Ticket**. Ticket is saved with status `assigned` immediately.

The full ticket information (all fields above) is visible to the technician in the mobile app.

### Track Ticket Status — Tickets Board
Go to **Maintenance Tickets → Tickets Board**.

- Filter by status: All / Assigned / In-Progress / Completed / Verified
- Each ticket shows: station ID, title, technician name, status badge, priority, anomaly zone, date created
- If a report was submitted, the board also shows the field notes, sensor status, severity, and root cause inline

**Manual status override**: The analyst can push a ticket from `assigned → in-progress` or `in-progress → completed` directly from the board, in case a technician has not updated it.

### Review & Approve — Inspection Reports
Go to **Maintenance Tickets → Inspection Reports**.

Pending reports appear expanded at the top. Each report shows:
- Station ID and ticket title
- Technician name and submission date
- Field observations (notes)
- Sensor working: Yes / No
- Severity: Low / Medium / High
- Root cause (if provided)
- Attached photos (if provided)

The analyst can add notes and click **Approve & Mark Verified**. This closes the ticket as `verified`.

Already-approved reports are listed collapsed below for record-keeping.

### Manage Technician Accounts
Go to **Maintenance Tickets → Manage Technicians**.

- View all existing technician accounts with their active/inactive status
- Create a new technician account: fill in full name, username, email, phone (optional), and a temporary password
- The new technician can log in immediately using the username and password you provide

---

## Technician — What They Can Do

### Access
Mobile app via Expo Go. Log in with the username and password provided by the analyst.

### Dashboard — Active Tickets and History

The home screen shows two tabs:

**Active Tickets** — tickets with status `assigned` or `in-progress` assigned to you. Each card shows:
- Station name and ticket title
- Flagged anomaly description
- Station ID / location
- Assigned date/time

Tap a ticket to open the inspection form.

**History Queue** — tickets with status `completed` or `verified`. Each card shows the same information plus verification status (Pending Verification / Approved by Analyst). History tickets are read-only — you can see what you submitted.

Pull down to refresh either list.

### Submitting an Inspection Report

Tap an active ticket to open the report form. The top card shows the full ticket details from the analyst:
- Station name + ticket title
- Coordinates (if available)
- Flagged anomaly / description

Fill in the inspection fields:

| Field | Required | Notes |
|---|---|---|
| Field observations | Yes | What you saw on site |
| Sensor working? | No | Toggle Yes or No |
| Severity | No | Low / Medium / High |
| Root cause | No | Free text |
| Photo | No | Camera or gallery; one photo per report |

Click **Submit Verification Report**. This:
1. Creates an `inspection_reports` record with all your inputs
2. Uploads the photo to storage (if attached)
3. Moves the ticket to `completed`
4. The report immediately appears in the analyst's Inspection Reports view

After submitting, the ticket moves to your History Queue.

### Updating Progress to In-Progress

Each active ticket card shows a **Start Working** button. Tapping it sets the ticket to `in-progress` immediately — before opening the report form. The status updates in real time and is reflected on the analyst's Tickets Board. Once a ticket is `in-progress`, the Start Working button disappears and only **Submit Report** remains.

---

## What Appears on the Web After a Report is Submitted

Everything the technician submits is reflected in the Streamlit app:

| Technician input | Where it appears on the web |
|---|---|
| Field observations | Tickets Board (inline in ticket expander) + Inspection Reports |
| Sensor working | Tickets Board + Inspection Reports |
| Severity | Tickets Board + Inspection Reports |
| Root cause | Tickets Board + Inspection Reports |
| Photo | Inspection Reports (photo gallery) |
| Submission date | Inspection Reports |

---

## Honest Assessment

### What is fully implemented

- **Analyst (web)**: Login, ticket creation from anomaly results, ticket board with status filter, manual status override, inspection report review with signed-URL photo display, report approval, technician account creation — all complete.
- **Technician (mobile)**: Login, active tickets list with priority/zone/status display, history queue, "Start Working" button (sets in-progress), full report form (notes, sensor working, severity, root cause, photo), report submission to Supabase — all complete.
- **Database**: All four tables (`profiles`, `tickets`, `inspection_reports`, `inspection_photos`) with RLS policies. Complete.
- **Storage**: Private `inspection-photos` bucket. Analyst reads via signed URLs (service-role key). Technician uploads via authenticated storage RLS policy.
- **Data flow**: Report submitted by technician → immediately visible on the web with all fields and photos. Complete.

### Known limitations (by design)

- **One photo per report** — the spec calls for a single optional photo, which the app handles correctly. Multiple photos would require a UI loop and separate upload calls.
- **No push notifications** — technicians are not notified when a new ticket is assigned. Pull-to-refresh is the current mechanism.

### Is the design good enough?

Yes. The full loop is implemented end to end, including the previously missing in-progress status update. The data model is solid and no structural changes are needed.

---

## Related Files

- [TICKETING_SYSTEM_DESIGN.md](TICKETING_SYSTEM_DESIGN.md) — Database schema, RLS policies, API reference, Supabase setup steps
- [prototypes/streamlit_app.py](prototypes/streamlit_app.py) — Analyst web app implementation
- [prototypes/utils/supabase_client.py](prototypes/utils/supabase_client.py) — All Supabase API calls (analyst side)
- [App/services/supabaseApi.ts](App/services/supabaseApi.ts) — All Supabase API calls (technician side)
- [App/app/report.tsx](App/app/report.tsx) — Technician inspection report form
- [App/app/(tabs)/index.tsx](App/app/(tabs)/index.tsx) — Technician ticket dashboard
