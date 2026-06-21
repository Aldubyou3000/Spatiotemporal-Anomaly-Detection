# Ticket Flow

A maintenance ticket starts when an analyst spots an anomaly and ends when they confirm the technician's field work is complete. Here is the full journey in plain terms.

---

## The Two People Involved

**Analyst** — works on the web dashboard. Creates tickets, manages technician assignments, monitors progress, reviews inspection reports, and gives the final verdict (approve or request a re-visit).

**Technician** — works on the mobile app. Receives assigned tickets, travels to the site, does the work, and files an inspection report with photos.

---

## Lifecycle at a Glance

```
Analyst creates ticket (3-step confirmation)
            ↓
        ASSIGNED  →  Technician(s) see it in their Dashboard
            ↓
      IN-PROGRESS  →  Technician taps "Start Working"
            ↓
    PENDING REVIEW  →  Technician submits inspection report
            ↓
        ┌───┴────────────────────────┐
        ↓                           ↓
    VERIFIED                    FOLLOW-UP
  (ticket closed)      Technician sees "Start Re-visit"
                                    ↓
                              IN-PROGRESS (round 2)
                                    ↓
                            PENDING REVIEW (round 2)
                                    ↓
                              ... repeats until approved ...
                                    ↓
                                VERIFIED


  ASSIGNED only ──── Analyst cancels ────► CANCELLED (ticket voided)
```

---

## Step by Step

### 1. Analyst creates the ticket

The anomaly detection pipeline flags a rainfall station. The analyst opens the **Zones** page and dispatches a ticket using a 3-step form:

- **Step 1 — Details:** station, title, description, priority, anomaly zone
- **Step 2 — Assign Technicians:** select one or more field technicians (multi-select). Each technician shows their **current active workload** (how many open tickets they're handling, color-toned by load), and the lightest-loaded are listed first — so the analyst can balance the team instead of assigning blindly
- **Step 3 — Confirm Dispatch:** review a summary card before sending — all selected technicians receive the ticket on their mobile devices immediately

The analyst can assign multiple technicians to the same ticket if the job requires it.

---

### 2. Technician receives and starts the ticket

The technician opens the mobile app and sees the new ticket in their **Active** queue. The ticket shows the station, anomaly description, priority, assigned team, and any data files the analyst attached.

When the technician arrives on-site and begins work, they tap **Start Working**. The status moves to **In Progress** and the analyst can see this on the dashboard.

---

### 3. Technician submits the inspection report

Once the field work is done, the technician fills out an inspection report in the app:

- **Field Observations** — what they found on-site (required)
- **Severity** — how serious the issue was: low / medium / high
- **Root Cause** — what caused the anomaly
- **Corrective Action & Recommendations** — what was done to fix the issue, and any future maintenance recommendations
- **Issue Resolved** — yes or no — was the problem fixed
- **Photos** — up to 5 site photos (optional but recommended)

Submitting the report automatically moves the ticket to **Pending Review** and notifies the analyst. The ticket remains visible on the technician's Dashboard under the completed section.

---

### 4. Analyst reviews the report

The analyst opens the ticket on the **Tickets** page; tickets awaiting a decision surface at the top under a **Needs Review** group. Review happens **inline** in the ticket detail panel — the analyst reads the full inspection report (field observations, severity, root cause, corrective action & recommendations, issue resolution status, photos) and acts from the review panel in the action dock at the bottom of the same view.

From here the analyst has two options:

**Option A — Approve**
The analyst clicks **Approve**. The ticket moves to **Verified** (closed). The technician can see the closed ticket on their Dashboard.

**Option B — Request Follow-up**
The analyst decides the report is incomplete or the issue needs another look. They click **Request Follow-up** and write mandatory instructions for the technician (e.g. "Re-check sensor depth and record exact flow readings").

The current report is archived. The ticket moves to **Follow-up** status and reappears on the technician's Dashboard with the analyst's instructions displayed prominently.

---

### 5. Technician completes a follow-up visit

The technician sees "Follow-up Required" on the ticket with the analyst's instructions. They can also review their previous round's report directly in the app for context before heading to the site.

They tap **Start Re-visit**, travel to the station, and submit a new report. This is Round 2 (or Round 3, 4… if there are further follow-ups). The cycle repeats at Step 4 until the analyst approves.

---

### 6. Technician sees the final verdict

Once verified, the technician opens the closed ticket on their **Dashboard** and sees:

- The full inspection report they submitted (the approved round)
- Whether the analyst approved it and any remarks they added

---

## Managing Technicians on a Ticket

The analyst can **add or remove technicians at any point** before the ticket is closed — including while work is already in progress. This handles real-world situations like a technician going unavailable mid-job or a complex repair needing a specialist brought in.

- Removing a technician immediately revokes their mobile access to the ticket.
- Adding a technician gives them immediate access.
- At least one technician must remain assigned at all times.
- Previously removed technicians are preserved in the assignment history for accountability.
- The add-technician picker shows each candidate's **current active workload** (least-busy first), so reassignments stay balanced.

---

## Cancelling a Ticket

If the analyst determines the ticket was created in error (e.g. a pipeline false alarm) and **no technician has started work yet**, they can cancel the ticket from the **Assigned** status. A reason is required. Once a technician has started (`In Progress`), cancellation is blocked — the work order must complete normally.

Cancelled tickets remain visible to both parties for record-keeping but no further actions can be taken on them.

---

## What Each Side Sees

### Analyst — Web Dashboard

| Page | What it shows |
|------|--------------|
| **Tickets** | All tickets across all statuses; tickets awaiting a decision surface under a **Needs Review** group. Full detail with report, photos, attachments, the assignment manager, inline review (Approve / Request Follow-up), and the cancel option — all in one panel. |
| **Zones** | Run the detection pipeline and create tickets from flagged anomalies (3-step dispatch form) |
| **Technicians** | Field-team management; each technician's current **active workload** is shown so dispatch decisions aren't blind |

> There is no separate "Reports" page — report review is handled inline on the Tickets page. (`/reports` simply redirects to `/tickets`.)

### Technician — Mobile App

| Tab | What it shows |
|-----|--------------|
| **Dashboard** | Ticket queue — active (`assigned`, `follow_up`), in-progress, and completed tickets in a unified view |
| **Activity** | Personal audit feed — ticket events (status changes, assignments) for this technician |
| **Profile** | Account details and app settings |

---

## Multiple Rounds

Every time the analyst requests a follow-up, a new round begins. The technician can always see all prior rounds of reports when preparing for a re-visit. The analyst sees all rounds on the Reports page, with the current active report shown at the top.

| Round | What happened |
|-------|--------------|
| Round 1 | First visit — report submitted |
| Round 2+ | Follow-up visit — new report submitted after analyst sent ticket back |

---

## PDF Export

Both the analyst and the technician can download a PDF of any ticket at any time. The PDF includes ticket details, the active inspection report, and analyst remarks if the ticket has been verified.
