# Ticketing System Design — Brainstorm & Requirements

**Date**: May 24, 2026  
**Purpose**: Define requirements for the maintenance ticket workflow connecting Streamlit (analyst) → Supabase + FastAPI → Expo (technician)

---

## Architecture Overview

```
Streamlit (Data Analyst)
    ↓ Creates maintenance ticket when anomaly detected
Supabase (Database)
    ↓ Stores ticket metadata + inspection reports
FastAPI (Backend API)
    ↓ Handles CRUD operations
Expo App (Technician)
    ↓ Views assigned tickets, submits inspection reports with photos
```

**Tech Stack**:
- **Database**: Supabase (PostgreSQL + built-in Storage)
- **Backend API**: FastAPI
- **Frontend**: Streamlit (analyst) + Expo (technician)
- **Authentication**: Hardcoded for MVP (analyst creates technician accounts)

---

## What's Working ✅

- **Clear role separation**: Analyst (detects) → Technician (inspects) is intuitive
- **Supabase + FastAPI combo**: Good choice. Supabase handles DB + storage; FastAPI is lightweight and perfect for this
- **Expo client**: Already set up; just needs to call real APIs instead of mock data
- **Hardcoded auth for MVP**: Fine for now—you can iterate later

---

## Critical Questions to Answer FIRST ⚠️

### 1. Ticket Data Model — What fields does a ticket need?

**Minimum Viable Ticket**:
```
- id (UUID)
- analyst_id (who created it)
- technician_id (who will inspect)
- station_id (which AWS station needs inspection)
- status (enum: created → assigned → in-progress → completed → approved)
- anomaly_data (JSON: which values were anomalous? which zone detected it?)
- created_at, assigned_at, completed_at
- priority (high/medium/low?)
- title / description (analyst notes about what to inspect)
```

**Questions**:
- Does analyst want to attach the actual CSV data/chart?
- Should tickets have a due date?
- Do you need SLA tracking (e.g., "must complete within 24 hours")?

---

### 2. Technician Report Structure — What does the technician submit?

**Current Expo Design Shows**:
- notes (text input)
- photos (image picker)

**Missing**:
- measurement data? (re-read the sensor?)
- checkbox validation? (e.g., "Sensor working: Y/N")
- severity assessment? (is this a real anomaly?)
- repair recommended? (Y/N + cost estimate?)
- inspection_date (when did you check it?)
- root_cause (why did anomaly occur?)

**Recommendation for MVP**: Start with notes + photos only; add structured fields in Phase 2.

---

### 3. Ticket Workflow State Machine — What are valid transitions?

**Proposed Flow**:
```
created → assigned → acknowledged → in-progress → completed → verified
```

**Questions**:
- Can analyst reassign mid-inspection?
- Can technician reject a ticket? (If sensor is broken and can't be inspected)
- What triggers "verified"? (Analyst review? Auto-approval?)
- Can tickets expire/timeout?
- Can technician save draft report and submit later?

**Recommendation**: 
```
For MVP:
created → assigned → completed → verified

Simple, low overhead. Add complexity later.
```

---

### 4. Real-Time Requirements

**Does analyst see technician report immediately?**

- **If YES**: Use WebSockets (Supabase Realtime or separate service)
- **If NO**: Polling is fine; technician submits report, analyst reviews later

**Recommendation for MVP**: NO (better for MVP). Analyst checks dashboard periodically.

---

### 5. Photo Storage Strategy

**Options**:
1. **Supabase Storage** (recommended)
   - Easy integration with Supabase DB
   - Store file URLs in ticket_reports table
   - Built-in access control

2. **AWS S3** (if scaling beyond prototype)
   - More expensive, more control
   - Worth it if millions of photos

3. **Local app storage** (NOT recommended)
   - Risky; loses data if app crashes
   - Can't access from analyst dashboard

**Recommendation**: Use Supabase Storage for MVP.

---

## Architecture Concerns ⚠️

### Authentication (Your "Hardcoded" Plan)

**Option A: Better (Recommended)**
```
Use Supabase Auth with role-based access
- Analyst role: can create tickets, view reports, approve
- Technician role: can only see assigned tickets, submit reports
- Admin role: create analyst/technician accounts

Benefits:
- Supabase RLS (Row-Level Security) handles access control
- Audit trail built-in
- Can revoke access anytime

Effort: 2 hours to set up
```

**Option B: Your Current Plan (Hardcoded)**
```
Hardcoded auth tokens
- Works for MVP
- Risk: No audit trail, can't revoke access easily
- Fine if testing with 2-3 people

Effort: 30 minutes
```

**Honest Take**: I'd recommend Option A (2 hours now saves 10 hours of headaches later).

---

### FastAPI Routes You'll Need

```python
# ===== TICKETS =====
POST   /api/tickets                    # Analyst creates ticket
GET    /api/tickets/{id}              # Technician views ticket (verify access)
GET    /api/tickets?assigned_to={uid} # Technician lists assigned tickets
GET    /api/tickets?analyst_id={uid}  # Analyst lists created tickets
PATCH  /api/tickets/{id}              # Update status (created→assigned, etc.)
DELETE /api/tickets/{id}              # Analyst cancels ticket (rare)

# ===== REPORTS =====
POST   /api/tickets/{id}/reports      # Technician submits report
GET    /api/tickets/{id}/reports      # Analyst views report
PATCH  /api/reports/{report_id}       # Analyst approves/rejects
GET    /api/reports                   # Analyst lists all reports (dashboard)

# ===== TECHNICIANS (Admin) =====
POST   /api/admin/technicians         # Create technician account
GET    /api/admin/technicians         # List all technicians
PATCH  /api/admin/technicians/{id}    # Update technician (activate/deactivate)
DELETE /api/admin/technicians/{id}    # Remove technician

# ===== PHOTO UPLOAD =====
POST   /api/reports/{report_id}/photos # Upload photo (returns URL)
GET    /api/reports/{report_id}/photos # List photos for report
```

**Question**: Will you use REST (above) or GraphQL?
- **Recommendation**: REST (FastAPI shines at REST; GraphQL adds complexity)

---

## Data Flow Overview

### Current State
```
Streamlit (reads CSV)
    ↓
Zone A/B/C (detects anomalies)
    ↓
Analyst reviews dashboard
    ↓ (Manual) Creates ticket
Supabase (tickets table)
    ↓
Expo app fetches ticket
    ↓
Technician submits report
    ↓
Supabase (reports table)
    ↓
Analyst reviews report in Streamlit dashboard ← Missing UI
```

### Missing Pieces
1. **Streamlit UI for creating/managing tickets** (new page)
2. **Streamlit dashboard for viewing technician reports** (new page)
3. **FastAPI endpoints** (to wire it all together)
4. **Supabase tables** (tickets, reports, technicians, photos metadata)

---

## Database Schema (Supabase Tables)

### Table: `technicians`
```sql
CREATE TABLE technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  station_ids TEXT[] DEFAULT '{}', -- stations they're assigned to
  is_active BOOLEAN DEFAULT true,
  created_by UUID NOT NULL, -- analyst who created account
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### Table: `tickets`
```sql
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id UUID NOT NULL, -- who created it
  technician_id UUID NOT NULL, -- who will inspect
  station_id TEXT NOT NULL, -- AWS station ID
  status TEXT DEFAULT 'created', -- created|assigned|in-progress|completed|verified
  priority TEXT DEFAULT 'medium', -- low|medium|high
  anomaly_zone TEXT, -- which zone detected it (A/B/C)
  anomaly_data JSONB, -- raw anomaly context
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT now(),
  assigned_at TIMESTAMP,
  completed_at TIMESTAMP,
  verified_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (analyst_id) REFERENCES analysts(id),
  FOREIGN KEY (technician_id) REFERENCES technicians(id)
);
```

### Table: `inspection_reports`
```sql
CREATE TABLE inspection_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE, -- one report per ticket
  technician_id UUID NOT NULL,
  notes TEXT,
  sensor_working BOOLEAN,
  severity TEXT, -- low|medium|high
  root_cause TEXT,
  repair_recommended BOOLEAN,
  repair_cost_estimate DECIMAL,
  created_at TIMESTAMP DEFAULT now(),
  submitted_at TIMESTAMP,
  analyst_approved BOOLEAN DEFAULT false,
  analyst_approved_at TIMESTAMP,
  analyst_notes TEXT,
  
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (technician_id) REFERENCES technicians(id)
);
```

### Table: `inspection_photos`
```sql
CREATE TABLE inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL,
  photo_url TEXT NOT NULL, -- URL in Supabase Storage
  description TEXT,
  uploaded_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (report_id) REFERENCES inspection_reports(id)
);
```

---

## Recommended Implementation Phases

### Phase 1: MVP (2 weeks)
1. ✅ Define ticket schema + report schema (document in SCHEMA.md)
2. ✅ Create Supabase tables (tickets, reports, technicians, photos)
3. ✅ Write FastAPI endpoints (CRUD for tickets/reports)
4. ✅ Wire Expo app to real API (replace mockApi.ts)
5. ✅ Add simple ticket creation UI to Streamlit (manual, no automation)
6. ✅ Test end-to-end: analyst creates ticket → technician sees it → submits report

### Phase 2: Automation (1 week)
1. Auto-create tickets when anomalies detected (Zone C triggers ticket creation)
2. Streamlit dashboard for viewing/approving reports
3. Ticket history & audit trail

### Phase 3: Polish (ongoing)
1. Supabase Auth + role-based access (replace hardcoded)
2. Real-time updates (WebSockets for instant notifications)
3. Photo management (batch uploads, compression)
4. SLA tracking & notifications

---

## Red Flags to Watch 🚩

| Risk | Mitigation |
|------|-----------|
| **Photo bloat** — Users upload huge images | Compress on Expo before upload; store in Supabase Storage |
| **Missing audit trail** — Can't prove who did what when | Add `created_by`, `updated_by`, `created_at` to all tables |
| **Notification gap** — Technician doesn't know ticket exists | Email notification or push notification (Expo + Supabase Realtime) |
| **Conflicting edits** — Analyst reassigns ticket same time technician starts work | Use status field; prevent reassign if status ≥ in-progress |
| **Report loss** — App crashes before submitting → photos lost | Auto-save drafts to AsyncStorage; resume on reopen |
| **Unauthorized access** — Technician sees other technician's tickets | Use Supabase RLS to filter by technician_id |
| **Photo access control** — Anyone can guess URL and view photos | Use Supabase Storage signed URLs with expiration |

---

## Questions for You 🤔

Before you start coding FastAPI, answer these:

1. **Who approves the technician's report?**
   - Just the analyst reviewing it?
   - Is there a second review (e.g., supervisor approval)?

2. **Can a technician see historical tickets** they've completed?
   - Only active tickets for MVP?
   - Full history for audit trail?

3. **What happens if a technician can't reach the station?**
   - Reject ticket?
   - Request delay?
   - Add status like "blocked"?

4. **Version control for photos?**
   - Replace old inspection photo, or keep all historical ones?
   - Should analyst be able to request "re-inspect"?

5. **Scheduling / Priority?**
   - Should high-priority tickets appear first?
   - Should technician see due date?

---

## TL;DR — My Honest Recommendation

**Your idea is good.** Don't overthink Phase 1—get it working with real API calls instead of mock data.

**But before coding, spend 3 hours upfront on**:
1. Ticket data model (what fields matter?)
2. Report data model (what does inspection capture?)
3. Ticket lifecycle (state machine)
4. API contract (what endpoints, what request/response shapes?)

**Then FastAPI/Supabase will flow naturally.**

**The biggest mistake**: Building APIs before knowing what data you actually need. Define schema first, code second.

---

## Next Steps

1. **Review this document** — Highlight sections that don't match your vision
2. **Answer the "Questions for You" section** above
3. **Create SCHEMA.md** in prototypes/ with finalized data model
4. **Start Phase 1 implementation**:
   - Supabase tables (SQL scripts)
   - FastAPI endpoints (Python)
   - Expo integration (TypeScript)
