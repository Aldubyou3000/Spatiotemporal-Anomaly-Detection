# Ticket Flow

A maintenance ticket starts when an analyst spots an anomaly and ends when they confirm the technician's field work. Here is the full journey.

---

## The Two People Involved

**Analyst** — works on the web dashboard. Creates tickets, monitors progress, reviews what the technician found, and gives a final verdict.

**Technician** — works on the mobile app. Receives assigned tickets, goes to the site, does the work, and files a report.

---

## Lifecycle at a Glance

```
Analyst creates ticket
        ↓
    ASSIGNED  →  Technician sees it in their Active queue
        ↓
  IN PROGRESS  →  Technician taps "Start" on the ticket
        ↓
  COMPLETED   →  Technician submits inspection report
        ↓
  VERIFIED    →  Analyst approves the report
```

---

## Step by Step

### 1. Analyst creates the ticket

The analyst reviews the anomaly results from the pipeline and decides a site visit is needed. They open the **Tickets** tab on the web dashboard and create a new ticket, filling in:

- Which station is affected
- A title and description of the anomaly
- The priority level (low / medium / high)
- Which technician to assign it to

The ticket is immediately visible to the assigned technician in their mobile app.

---

### 2. Technician receives and starts the ticket

The technician opens the mobile app and sees the new ticket in their **Active** tab. The ticket shows the station, anomaly description, priority, and any files the analyst attached.

When the technician arrives on-site and begins work, they tap **Start** on the ticket. The status moves to **In Progress** and the analyst can see this update on the dashboard.

---

### 3. Technician submits the inspection report

Once the field work is done, the technician fills out an inspection report directly in the app:

- **Field Observations** — a free-text description of what they found
- **Sensor Working** — yes or no
- **Severity** — their assessment of how serious the issue is
- **Root Cause** — what they believe caused the anomaly
- **Photos** — one or more photos taken at the site (optional)

Submitting the report automatically moves the ticket to **Completed**. The ticket moves out of the technician's active queue and into their **History** tab.

---

### 4. Analyst reviews and approves

The analyst sees the completed ticket appear in the **Reports** tab. They can read the full inspection report including field observations, sensor status, severity, root cause, and any photos uploaded by the technician.

The analyst writes their **Analyst Remarks** — a final note or decision — and clicks **Approve**.

The ticket moves to **Verified** and the remarks become visible to the technician in their History tab.

---

### 5. Technician sees the verdict

The technician opens the closed ticket in their **History** tab. They can see:

- The full inspection report they submitted
- The analyst's remarks and whether the report was approved

---

## What Each Side Sees

### Analyst — Web Dashboard

| Tab | What it shows |
|-----|--------------|
| Tickets | All tickets across all statuses; full detail panel with report, photos, and attachments |
| Reports | Completed tickets awaiting review; approval form with remarks field |

### Technician — Mobile App

| Tab | What it shows |
|-----|--------------|
| Active | Tickets assigned but not yet started (`assigned`) |
| In Progress | Tickets currently being worked on |
| History | Completed and verified tickets with the analyst's final remarks |

---

## Reassignment

If the analyst needs to send the ticket to a different technician, they can reassign it from the Tickets tab at any point. The ticket returns to **Assigned** status and the new technician sees it in their Active queue.

---

## PDF Export

Both the analyst and the technician can download a PDF of any ticket. The PDF includes everything visible at that point in the lifecycle — ticket details, the inspection report if submitted, and the analyst remarks if the ticket has been verified.
