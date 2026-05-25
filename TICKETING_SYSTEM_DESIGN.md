# Ticketing System — Design & Implementation Reference

**Last updated**: May 25, 2026  
**Status**: Phase 1 code complete; Supabase project setup still required (see Section 5)

---

## 1. Architecture Overview

```
Streamlit (Data Analyst)
    ↓ Creates maintenance ticket when anomaly detected
Supabase (Database + Auth + Storage)
    ↓ Stores tickets, reports, and photos
Expo App (Technician)
    ↓ Views assigned tickets, submits inspection reports
```

**Tech Stack**:
| Layer | Technology |
|-------|-----------|
| Database & Auth | Supabase (PostgreSQL + RLS + Supabase Auth) |
| Storage | Supabase Storage (`inspection-photos` bucket) |
| Backend API | FastAPI (Phase 2) |
| Analyst frontend | Streamlit |
| Technician frontend | Expo (React Native) |

**Key environment rule**:
- Expo uses `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` (safe for mobile, tracked in git)
- Streamlit uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (gitignored — never shared)
- FastAPI uses service_role key (Phase 2)

---

## 2. Ticket Workflow

**Status state machine**:
```
created → assigned → in-progress → completed → verified
```

For MVP (current), tickets skip directly to `assigned` on creation (the `create_ticket()` function sets status to `assigned` immediately).

**Valid transitions**:
- Analyst creates ticket → status `assigned`
- Technician starts work → status `in-progress` (optional)
- Technician submits report → status `completed`
- Analyst approves report → status `verified`

---

## 3. Database Schema

Run the full SQL block in Supabase SQL Editor (see Section 5, Step 2).

### Table: `profiles`

Single table for both analysts and technicians (role-based access via RLS).

```sql
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('analyst', 'technician')),
  phone       TEXT,
  station_ids TEXT[]  DEFAULT '{}',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "own_profile_read"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Analysts can read all profiles (to assign tickets to technicians)
CREATE POLICY "analyst_read_all_profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- Analysts can insert new profiles (for creating technician accounts)
CREATE POLICY "analyst_create_profiles"
  ON profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'analyst'
    )
  );

-- Users can update their own profile
CREATE POLICY "own_profile_update"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

---

### RPC Function: Username-to-Email Bridge

Allows username login — the app doesn't expose email addresses.

```sql
CREATE OR REPLACE FUNCTION get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM profiles
  WHERE username = lower(trim(p_username))
    AND is_active = true;
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION get_email_by_username(TEXT) TO anon;
```

---

### Table: `tickets`

```sql
CREATE TABLE tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_id     UUID NOT NULL REFERENCES profiles(id),
  technician_id  UUID NOT NULL REFERENCES profiles(id),
  station_id     TEXT NOT NULL,
  status         TEXT DEFAULT 'created'
                   CHECK (status IN ('created','assigned','in-progress','completed','verified')),
  priority       TEXT DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high')),
  anomaly_zone   TEXT CHECK (anomaly_zone IN ('A','B','C')),
  anomaly_data   JSONB,
  title          TEXT NOT NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  assigned_at    TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  verified_at    TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Technician sees tickets assigned to them; analyst sees all
CREATE POLICY "technician_see_assigned"
  ON tickets FOR SELECT
  USING (
    technician_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'analyst')
  );

-- Analysts can create tickets
CREATE POLICY "analyst_create_tickets"
  ON tickets FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'analyst')
  );

-- Technician or analyst can update tickets
CREATE POLICY "analyst_or_technician_update"
  ON tickets FOR UPDATE
  USING (
    technician_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'analyst')
  );
```

---

### Table: `inspection_reports`

One report per ticket (enforced by UNIQUE constraint on `ticket_id`).

```sql
CREATE TABLE inspection_reports (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id            UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  technician_id        UUID NOT NULL REFERENCES profiles(id),
  notes                TEXT,
  sensor_working       BOOLEAN,
  severity             TEXT CHECK (severity IN ('low','medium','high')),
  root_cause           TEXT,
  repair_recommended   BOOLEAN,
  repair_cost_estimate DECIMAL,
  submitted_at         TIMESTAMPTZ,
  analyst_approved     BOOLEAN DEFAULT false,
  analyst_approved_at  TIMESTAMPTZ,
  analyst_notes        TEXT,
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;

-- Technician can manage their own reports
CREATE POLICY "technician_own_reports"
  ON inspection_reports FOR ALL
  USING (technician_id = auth.uid());

-- Analyst can read all reports
CREATE POLICY "analyst_read_reports"
  ON inspection_reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'analyst')
  );

-- Analyst can approve/update reports
CREATE POLICY "analyst_approve_reports"
  ON inspection_reports FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'analyst')
  );
```

---

### Table: `inspection_photos`

```sql
CREATE TABLE inspection_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   UUID NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  description TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;

-- Photos follow report access rules
CREATE POLICY "photos_follow_report_access"
  ON inspection_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inspection_reports ir
      WHERE ir.id = report_id
        AND (
          ir.technician_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'analyst')
        )
    )
  );

-- Technician can insert photos to their own reports
CREATE POLICY "technician_insert_photos"
  ON inspection_photos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inspection_reports ir
      WHERE ir.id = report_id AND ir.technician_id = auth.uid()
    )
  );
```

---

## 4. Implementation Status

### Phase 1 — MVP ✅ Code Complete

| Item | Status | File |
|------|--------|------|
| Supabase client (Expo) | ✅ Done | `App/services/supabase.ts` |
| Ticket/report API (Expo) | ✅ Done | `App/services/supabaseApi.ts` |
| Auth context (Expo) | ✅ Done | `App/context/AppContext.tsx` |
| Supabase client (Streamlit) | ✅ Done | `prototypes/utils/supabase_client.py` |
| requirements.txt | ✅ Done | `requirements.txt` |
| .gitignore (root + App/) | ✅ Done | `.gitignore`, `App/.gitignore` |
| **Supabase project creation** | ⏳ You do this | See Section 5 |
| **Run SQL schema** | ⏳ You do this | See Section 5 |
| **Create storage bucket** | ⏳ You do this | See Section 5 |
| **Create analyst account** | ⏳ You do this | See Section 5 |

### Phase 2 — Automation (Next)

- [ ] Streamlit UI page for creating/managing tickets
- [ ] Streamlit dashboard for viewing/approving technician reports
- [ ] FastAPI endpoints (see Section 7 for planned routes)
- [ ] Auto-create ticket when anomaly detected (Zone C triggers)
- [ ] Photo uploads from Expo app

### Phase 3 — Polish (Later)

- [ ] Real-time updates via Supabase Realtime / WebSockets
- [ ] Push notifications (Expo + Supabase)
- [ ] SLA tracking and alerts
- [ ] Photo management (batch uploads, compression)

---

## 5. Supabase Project Setup (You Do These Steps)

### Step 1 — Create Project (2 min)

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Fill in:
   - **Name**: `spatiotemporal-anomaly`
   - **Database password**: Generate and save it
   - **Region**: Southeast Asia (Singapore)
3. Wait ~2 minutes until project shows "Connected"

---

### Step 2 — Run the SQL Schema (5 min)

1. Supabase dashboard → **SQL Editor** → **New query**
2. Paste the entire SQL block from Section 3 above (all four tables + RPC function)
3. Click **Run** (▶)

Run tables in this order: `profiles` → `tickets` → `inspection_reports` → `inspection_photos`

✅ Done when: "Success. No rows returned" appears at the bottom.

---

### Step 3 — Create Storage Bucket (5 min)

1. Supabase dashboard → **Storage** → **New bucket**
2. Fill in:
   - **Name**: `inspection-photos`
   - **Public bucket**: OFF (private — analyst accesses via signed URLs)
3. Click **Save**

4. In **SQL Editor**, run this storage policy so technicians can upload photos:

```sql
-- Allow authenticated technicians to upload photos to their own report folders
CREATE POLICY "technician_upload_photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'inspection-photos');

-- Allow authenticated users to read photos (analyst reads via signed URLs from service role,
-- but this policy is required for the storage path to resolve)
CREATE POLICY "authenticated_read_photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'inspection-photos');
```

> **Note**: The Streamlit analyst app uses the **service_role** key, which bypasses storage RLS entirely and can always generate signed URLs. The Expo app uses the **anon** key with the authenticated role — the INSERT policy above is what allows technicians to upload.

---

### Step 4 — Create Your Analyst Account (5 min)

**Part A — Create auth user:**

1. Supabase dashboard → **Authentication** → **Users** → **Add user** → **Create new user**
2. Enter your email and a password → **Create user**
3. Copy the UUID from the users list

**Part B — Create profile row:**

```sql
INSERT INTO profiles (id, username, full_name, email, role)
VALUES (
  'YOUR_UUID_HERE',
  'your_chosen_username',
  'Your Full Name',
  'your@email.com',
  'analyst'
);
```

Replace the four placeholders and run in SQL Editor.

---

### Step 5 — Collect API Keys (1 min)

Supabase dashboard → **Project Settings** (gear icon) → **API**

| Key | Location | Safe to share? |
|-----|----------|----------------|
| Project URL | Top of API page | ✅ Yes |
| anon / public | Under "Project API keys" | ✅ Yes (mobile safe) |
| service_role | Under "Project API keys" | ⚠️ Server-side only |

Put these in your env files:

```bash
# App/.env  (gitignored)
EXPO_PUBLIC_SUPABASE_URL=your_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# prototypes/.env  (gitignored)
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 6. Code Reference

### Expo (TypeScript)

**Client initialization** — `App/services/supabase.ts`:
```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
```

**Ticket API** — `App/services/supabaseApi.ts`:
- `fetchActiveTickets()` — returns tickets in `created/assigned/in-progress` for current user
- `fetchTicketHistory()` — returns `completed/verified` tickets
- `submitInspectionReport(dbTicketId, notes, imageUri)` — inserts report, sets ticket to `completed`

**Auth** — `App/context/AppContext.tsx`:
- `login(username, password)` — resolves username → email via RPC, then `signInWithPassword`
- `logout()` — calls `supabase.auth.signOut()`
- Profile loaded automatically from `profiles` table on session change

---

### Streamlit (Python)

**Client** — `prototypes/utils/supabase_client.py`:
- `get_supabase()` — service-role client (bypasses RLS, DB operations)
- `get_anon_client()` — anon client (user-level auth)
- `sign_in_analyst(username, password)` — resolves username → email → auth → profile
- `fetch_all_tickets(status_filter)` — returns tickets with technician join
- `create_ticket(analyst_id, technician_id, station_id, title, ...)` — inserts ticket as `assigned`
- `update_ticket_status(ticket_id, status)` — updates status + `updated_at`
- `fetch_all_reports()` — returns reports with ticket + technician join
- `approve_report(report_id, ticket_id, analyst_notes)` — approves report + sets ticket to `verified`
- `fetch_technicians(active_only)` — lists technician profiles
- `create_technician_account(email, password, full_name, username, ...)` — creates Supabase Auth user + profile row

---

## 7. FastAPI Routes (Phase 2)

```python
# ===== TICKETS =====
POST   /api/tickets                    # Analyst creates ticket
GET    /api/tickets/{id}              # View ticket
GET    /api/tickets?assigned_to={uid} # Technician lists assigned tickets
GET    /api/tickets?analyst_id={uid}  # Analyst lists created tickets
PATCH  /api/tickets/{id}              # Update status
DELETE /api/tickets/{id}              # Analyst cancels ticket

# ===== REPORTS =====
POST   /api/tickets/{id}/reports      # Technician submits report
GET    /api/tickets/{id}/reports      # View report
PATCH  /api/reports/{report_id}       # Analyst approves/rejects
GET    /api/reports                   # Analyst lists all reports

# ===== TECHNICIANS (Admin) =====
POST   /api/admin/technicians         # Create technician account
GET    /api/admin/technicians         # List all technicians
PATCH  /api/admin/technicians/{id}    # Activate/deactivate
DELETE /api/admin/technicians/{id}    # Remove technician

# ===== PHOTOS =====
POST   /api/reports/{report_id}/photos # Upload photo
GET    /api/reports/{report_id}/photos # List photos
```

Using REST (not GraphQL) — FastAPI is optimized for REST.

---

## 8. Security Checklist

| Risk | Protection |
|------|-----------|
| Keys committed to GitHub | `.env` files in both `.gitignore` files |
| service_role key in mobile app | Never — stored only in `prototypes/.env` |
| Technician sees other technician's tickets | RLS policy `technician_see_assigned` |
| Anyone guesses photo URLs | Private bucket + signed URLs (Phase 2) |
| Unauthenticated API access | RLS enabled on all tables |
| Username exposes email | RPC `get_email_by_username()` (controlled access) |
| Brute force login | Supabase Auth built-in rate limiting |
| Report loss (app crash before submit) | Phase 2: auto-save draft to AsyncStorage |
| Conflicting edits (reassign mid-inspection) | Status field prevents reassign if status ≥ `in-progress` |

---

## 9. Related Documentation

- [App/AGENTS.md](App/AGENTS.md) — Expo development conventions, file structure, patterns
- [AGENTS.md](AGENTS.md) — Root dual-project architecture overview
