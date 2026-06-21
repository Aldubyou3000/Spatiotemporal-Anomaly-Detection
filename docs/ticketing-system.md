# Ticketing System — Process & Lifecycle Reference

## Overview

When the anomaly detection pipeline flags a rainfall monitoring station as abnormal, an **analyst** creates a maintenance ticket to dispatch field technicians for physical inspection and repair. This document defines the complete process, all actors, every status, and the full lifecycle of a ticket from creation to closure.

---

## Actors

| Actor | Interface | Responsibilities |
|-------|-----------|-----------------|
| **Analyst** | Web dashboard | Create tickets, review inspection reports, approve or request follow-ups, manage technician assignments |
| **Technician** | Mobile app | Receive assigned tickets, start work, submit inspection reports, upload photos |

---

## Ticket Fields

| Field | Description |
|-------|-------------|
| `id` | UUID — unique identifier |
| `title` | Short description of the work order |
| `description` | Analyst's notes on what to inspect |
| `station_id` | Which rainfall monitoring station to visit |
| `priority` | `low / medium / high` |
| `anomaly_zone` | Which pipeline stage flagged the anomaly (`A / B / C`) |
| `anomaly_data` | Raw ML detection output (analyst-only) |
| `status` | Current lifecycle stage (see below) |
| `analyst_id` | Who created the ticket |
| `technicians[]` | Active assigned field technicians |
| `technicians_history[]` | Previously removed technicians (soft-deleted, kept for audit) |
| `follow_up_count` | How many times the ticket has been sent back |
| `follow_up_notes` | Analyst's instructions for the most recent follow-up |
| `last_follow_up_at` | Timestamp of most recent follow-up request |
| `cancelled_at` | When it was cancelled (if applicable) |
| `cancellation_reason` | Why it was cancelled (required at cancellation) |
| `created_at` | Ticket creation timestamp |
| `assigned_at` | When first technician was dispatched |
| `completed_at` | When technician submitted the report |
| `verified_at` | When analyst approved the report |
| `updated_at` | Last modification timestamp |

---

## Ticket Statuses

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `assigned` | Created and dispatched — technician(s) notified, work not yet started | No |
| `in-progress` | Technician has started work on-site | No |
| `pending_review` | Technician submitted a report — awaiting analyst decision | No |
| `follow_up` | Analyst sent it back for re-visit — report archived, new round required | No |
| `verified` | Analyst approved the report — closed | **Yes** |
| `cancelled` | Cancelled before work started — voided | **Yes** |

---

## Full Lifecycle

```
                    [Analyst creates ticket]
                             │
                             ▼
                         ASSIGNED ◄──────────────────────────────────────────┐
                             │                                                │
                             │ Technician: "Start Working"                    │
                             ▼                                                │ Analyst can
                        IN-PROGRESS ◄─────────────────────────────────────┐  │ add/remove
                             │                                             │  │ technicians
                             │ Technician: submits report                  │  │ at any
                             ▼                                             │  │ non-terminal
                      PENDING REVIEW                                       │  │ status
                             │                                             │  │
               ┌─────────────┴──────────────┐                             │  │
               │                            │                             │  │
   Analyst: Approve              Analyst: Request Follow-up               │  │
               │                            │                             │  │
               ▼                            ▼                             │  │
           VERIFIED                     FOLLOW-UP ────────────────────────┘  │
          (terminal)              Technician: "Start Re-visit"                │
                                                                              │
    Only from ASSIGNED ─── Analyst: Cancel ───► CANCELLED                    │
                            (reason required)    (terminal)                   │
```

### State Transition Table

| From | To | Actor | Guard / Condition |
|------|----|-------|-------------------|
| — | `assigned` | Analyst | Ticket created; at least 1 technician assigned |
| `assigned` | `in-progress` | Technician | Taps "Start Working" on mobile |
| `follow_up` | `in-progress` | Technician | Taps "Start Re-visit" on mobile |
| `in-progress` | `pending_review` | Technician | Submits inspection report (auto-transition) |
| `pending_review` | `verified` | Analyst | Approves report |
| `pending_review` | `follow_up` | Analyst | Requests follow-up (notes required) |
| `follow_up` | `in-progress` | Technician | Starts new round |
| `assigned` | `cancelled` | Analyst | Cancels before work starts (reason required) |
| Any non-terminal | — | Analyst | Add or remove technicians (min 1 active always) |

---

## Inspection Reports

Each report is linked to one ticket and one **round** number. Follow-up visits produce a new round. Previous rounds are archived (`is_active = FALSE`) but preserved.

| Field | Description |
|-------|-------------|
| `round` | Visit number (1 = first visit, 2+ = follow-up rounds) |
| `is_active` | Only one report per ticket can be active at a time |
| `notes` | Technician's field observations (what was found on arrival) |
| `severity` | `low / medium / high` — how serious the issue was |
| `root_cause` | What caused the anomaly |
| `corrective_action` | What the technician did to fix the issue, and any recommendations for future maintenance |
| `issue_resolved` | Boolean — was the problem fixed? |
| `photos` | Attached inspection photos (signed URLs) |
| `submitted_at` | When the report was submitted |
| `analyst_approved` | Whether the analyst approved it |
| `analyst_approved_at` | When it was approved |
| `analyst_notes` | Analyst's remarks on approval |

### Round Lifecycle

```
Round 1:  submitted → is_active = TRUE
              │
    Analyst requests follow-up
              │
Round 1:  is_active set to FALSE  (archived — still readable)
Round 2:  submitted → is_active = TRUE
              │
    Analyst approves
              │
Ticket → VERIFIED
```

---

## Technician Assignment Rules

- A ticket must have **at least one active technician** at all times.
- Multiple technicians can be assigned simultaneously (many-to-many via `ticket_technicians` junction table).
- Technicians can be added or removed at any **non-terminal** status (`assigned`, `in-progress`, `pending_review`, `follow_up`).
- Removing a technician is a **soft-delete** — the `ticket_technicians` row is retained with `removed_at` set. It appears in `technicians_history[]` for full audit visibility.
- Re-adding a previously removed technician restores their record (clears `removed_at`).
- The `technician_id` column on tickets is a legacy shadow field pointing to the earliest active assignee — kept for PDF generation backward compatibility only. Always use `technicians[]` for the full authoritative list.

### Workload visibility (informed manual dispatch)

Assignment is **manual** — the analyst decides who to dispatch. To support that decision (and avoid blindly overloading one technician), every analyst-facing assignment surface shows each technician's **current active workload**: the number of non-terminal tickets they're assigned to, color-toned by load (idle / light / busy / heavy) with a per-status breakdown ("2 assigned · 1 in review"). The lightest-loaded technicians are listed first.

- **Where:** ticket-creation step 2 (Assign), the add-technician pickers on existing tickets (action dock + follow-up reassignment), and the Technicians page ("Active Load" column).
- **How it's computed:** server-side aggregate over the `ticket_technicians` junction (active rows only) joined to non-terminal tickets, returned on `GET /api/tickets/technicians` (analyst-only). Only counts cross the wire — never ticket rows or ids.
- **Live:** the counts update in real time via the existing SSE `tickets` signal whenever any ticket is assigned, removed, verified, or cancelled — no manual refresh.
- There is **no manual availability toggle**: workload *is* the availability signal. (Station-coverage matching is intentionally not part of this yet.)

---

## What Each Actor Sees Per Status

### Analyst — Web Dashboard

| Status | Visible content | Available actions |
|--------|----------------|-------------------|
| `assigned` | Ticket info, active assignees, assignment history | Add / remove technicians, Cancel ticket |
| `in-progress` | Ticket info, assignees, assignment history, started timestamp | Add / remove technicians |
| `pending_review` | Ticket info, inspection report (round N), photos, assignees | Approve, Request follow-up, Add / remove technicians |
| `follow_up` | Ticket info, follow-up instructions, all prior rounds (read-only), assignees | Add / remove technicians |
| `verified` | Full history — all rounds, active + historical assignees, verified timestamp | None |
| `cancelled` | Ticket info, cancellation reason, cancellation timestamp | None |

### Technician — Mobile App

Tickets are shown on the **Dashboard** tab, grouped by status. The **Activity** tab shows the technician's personal audit feed (ticket events only — no analyst-only data). The **Profile** tab shows account settings.

| Status | Visible content | Available actions |
|--------|----------------|-------------------|
| `assigned` | Title, station, priority, description, co-assignees, analyst name | **Start Working** |
| `in-progress` | Same as assigned + round indicator if round 2+ + prior round reports (collapsed, for context) | **Submit Report** |
| `pending_review` | Ticket info, submitted report (read-only), "Under Review" notice | None |
| `follow_up` | Ticket info, **analyst instructions (prominent)**, re-visit number, prior round reports | **Start Re-visit** |
| `verified` | Ticket info, approved report | None — read-only |
| `cancelled` | Ticket info, cancellation reason | None — read-only |

> Technicians never see `anomaly_data` (raw ML output). They only see the analyst's human-written description.

---

## Complete Lifecycle Scenarios

### Scenario 1 — Simple Single Visit
Station flagged. One technician dispatched, issue fixed, report approved.
```
assigned → in-progress → pending_review → verified
```

### Scenario 2 — Multi-Technician Dispatch
Complex repair requiring two field technicians simultaneously.
```
assigned (Tech A + Tech B) → in-progress → pending_review → verified
```

### Scenario 3 — Follow-up (Insufficient Report)
Technician's report lacks specific measurements. Analyst sends it back.
```
assigned → in-progress → pending_review
  → follow_up  [analyst: "Re-check sensor depth and record exact readings"]
  → in-progress (round 2) → pending_review → verified
```

### Scenario 4 — Multiple Follow-ups
Issue persists across multiple visits.
```
assigned → in-progress → pending_review
  → follow_up (round 2)
  → in-progress → pending_review
  → follow_up (round 3)
  → in-progress → pending_review
  → verified
```

### Scenario 5 — Technician Replaced Before Starting
Original technician unavailable before work begins.
```
assigned (Tech A)
  → [Analyst removes Tech A, adds Tech B]
  → assigned (Tech B) → in-progress → pending_review → verified
```
Tech A's assignment is soft-deleted and visible in assignment history.

### Scenario 6 — Follow-up with Specialist Added
Original tech submits insufficient report. Analyst adds a specialist for round 2.
```
assigned (Tech A) → in-progress → pending_review
  → follow_up  [Analyst adds Tech B for round 2]
  → in-progress (Tech A + Tech B) → pending_review → verified
```
Tech B can see Tech A's round 1 report on mobile for context before the re-visit.

### Scenario 7 — No Fault Found (False Positive)
Technician inspects — station is operating normally.
```
assigned → in-progress
  → pending_review  [report: "No fault found — readings within normal range"]
  → verified
```
"No fault" is a valid finding. `verified` means reviewed and closed, not necessarily that something was broken.

### Scenario 8 — Cancelled (False Alarm Before Work Starts)
Analyst realises the pipeline flag was a data artifact before any technician starts.
```
assigned → cancelled  [reason: "Pipeline false positive — confirmed via manual data check"]
```
Only possible from `assigned`. Once a technician has started (`in-progress`), cancellation is blocked.

### Scenario 9 — Technician Added Mid-Progress
Analyst realises mid-job that the repair is more complex and dispatches backup.
```
assigned (Tech A) → in-progress (Tech A)
  → [Analyst adds Tech B mid-progress]
  → in-progress (Tech A + Tech B) → pending_review → verified
```

---

## Key Constraints

| Rule | Detail |
|------|--------|
| Minimum assignees | At least 1 active technician must remain on a ticket at all times. Removing the last one is blocked. |
| Cancel guard | Only allowed from `assigned`. Once a technician has started work, the ticket cannot be cancelled. |
| Follow-up guard | Can only be requested from `pending_review`. |
| Verified is final | No edits, reassignments, new reports, or further status changes. |
| Cancelled is final | Same — no further actions once cancelled. |
| One active report | Only one report per ticket can have `is_active = TRUE` (enforced by partial unique index `uq_ir_active`). |
| Assignment history | Removed technicians are soft-deleted, never hard-deleted. Full history is always preserved. |
| Analyst instructions required | Follow-up notes are mandatory — the analyst must explain what the technician needs to do differently. |
| Cancellation reason required | A reason is mandatory when cancelling a ticket. |

---

## Audit Trail

Every consequential action produces an immutable audit log entry with a SHA-256 chain hash (tamper-detectable).

| Event | Trigger |
|-------|---------|
| `ticket_created` | Ticket dispatched by analyst |
| `ticket_updated` | Ticket fields modified |
| `ticket_status_changed` | Any status transition |
| `ticket_cancelled` | Ticket cancelled by analyst |
| `technician_assigned` | Technician(s) added to ticket |
| `technician_removed` | Technician soft-deleted from ticket |
| `report_submitted` | Technician submits inspection report |
| `report_approved` | Analyst approves report, ticket moves to verified |
| `follow_up_requested` | Analyst sends ticket back for re-visit |
