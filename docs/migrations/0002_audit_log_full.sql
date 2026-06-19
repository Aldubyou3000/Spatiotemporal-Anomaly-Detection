-- Migration: Full audit_log schema (extends 0001_security_hardening.sql)
-- Run AFTER 0001.  Safe to re-run (idempotent).
-- Execute in the Supabase SQL editor or via `supabase db push`.

-- ─── 1. Drop old minimal table if upgrading from 0001 ─────────────────────────
-- If audit_log already exists from 0001, we ALTER it to add missing columns
-- rather than DROP/CREATE so we don't lose existing rows.

-- Add new columns to existing table (all idempotent via DO blocks)

do $$ begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'entity_type'
    ) then
        alter table public.audit_log add column entity_type text;
    end if;
end $$;

do $$ begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'entity_id'
    ) then
        alter table public.audit_log add column entity_id text;
    end if;
end $$;

do $$ begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'changes'
    ) then
        alter table public.audit_log add column changes jsonb;
    end if;
end $$;

do $$ begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'request_id'
    ) then
        alter table public.audit_log add column request_id text;
    end if;
end $$;

do $$ begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'success'
    ) then
        alter table public.audit_log add column success boolean not null default true;
    end if;
end $$;

do $$ begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'error_message'
    ) then
        alter table public.audit_log add column error_message text;
    end if;
end $$;

do $$ begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'audit_log' and column_name = 'chain_hash'
    ) then
        alter table public.audit_log add column chain_hash text;
    end if;
end $$;

-- ─── 2. Create table fresh if it doesn't exist yet ────────────────────────────
-- (Handles the case where 0001 was never run)
create table if not exists public.audit_log (
    -- identity
    id            bigint generated always as identity primary key,
    created_at    timestamptz not null default now(),

    -- who
    user_id       uuid        references auth.users(id) on delete set null,
    credential    text,                     -- normalised username/email (never a password)

    -- what
    event         text        not null,     -- e.g. 'login_success', 'ticket_updated'
    entity_type   text,                     -- e.g. 'ticket', 'inspection_report', 'profile'
    entity_id     text,                     -- UUID or ID of the affected row

    -- change data capture
    changes       jsonb,                    -- { "old": {...}, "new": {...} }

    -- where / how
    ip            text,
    user_agent    text,
    request_id    text,                     -- 8-char trace ID for request correlation

    -- outcome
    success       boolean     not null default true,
    error_message text,

    -- tamper-evidence
    chain_hash    text,                     -- SHA-256(content + prev_hash) chain

    -- freeform extra data
    meta          jsonb
);

-- ─── 3. Access control ────────────────────────────────────────────────────────
-- Service role bypasses RLS — it writes audit entries directly.
-- No other role can SELECT, INSERT, UPDATE, or DELETE.

alter table public.audit_log enable row level security;

do $$ begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'audit_log' and policyname = 'deny_all'
    ) then
        execute 'create policy deny_all on public.audit_log for all using (false)';
    end if;
end $$;

-- Append-only enforcement — no updates or deletes ever (even from service role).
create or replace rule audit_log_no_update
    as on update to public.audit_log do instead nothing;

create or replace rule audit_log_no_delete
    as on delete to public.audit_log do instead nothing;

-- ─── 4. Indexes ───────────────────────────────────────────────────────────────
-- Chosen to support the most common admin queries without over-indexing.

-- Primary admin dashboard query: "all events for user X in time range"
create index if not exists idx_audit_user_time
    on public.audit_log (user_id, created_at desc);

-- Filter by event type + time (login failures, lockouts, etc.)
create index if not exists idx_audit_event_time
    on public.audit_log (event, created_at desc);

-- Entity drill-down: "all changes to ticket abc123"
create index if not exists idx_audit_entity
    on public.audit_log (entity_type, entity_id, created_at desc)
    where entity_type is not null;

-- Security sweep: all failures in time range
create index if not exists idx_audit_failure_time
    on public.audit_log (success, created_at desc)
    where success = false;

-- IP-based investigation
create index if not exists idx_audit_ip_time
    on public.audit_log (ip, created_at desc)
    where ip is not null;

-- Chain integrity lookups (verify last known hash)
create index if not exists idx_audit_chain
    on public.audit_log (id desc, chain_hash)
    where chain_hash is not null;

-- ─── 5. Retention cleanup function ───────────────────────────────────────────
-- Deletes rows older than `retain_days` (default 365).
-- Call manually or schedule via pg_cron:
--   select cron.schedule('audit-cleanup', '0 3 * * *', $$select public.audit_log_cleanup()$$);

create or replace function public.audit_log_cleanup(retain_days int default 365)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
    deleted bigint;
begin
    -- Bypass the no-delete rule via a direct delete in a definer context.
    -- Only this function may delete audit rows, and only aged-out ones.
    delete from public.audit_log
    where created_at < now() - (retain_days || ' days')::interval;
    get diagnostics deleted = row_count;
    return deleted;
end;
$$;

-- Restrict direct calls to service_role only
revoke all on function public.audit_log_cleanup(int) from public;
grant execute on function public.audit_log_cleanup(int) to service_role;

-- ─── 6. Chain integrity verification function ─────────────────────────────────
-- Returns rows whose chain_hash doesn't match the re-computed value.
-- A non-empty result set means the log was tampered with.
-- Note: Python and Postgres SHA-256 must produce identical canonical JSON.
-- Use this as a periodic integrity check or forensic tool.

create or replace function public.audit_log_verify_chain(
    p_from_id bigint default 1,
    p_to_id   bigint default null
)
returns table (
    id           bigint,
    created_at   timestamptz,
    event        text,
    stored_hash  text,
    prev_hash    text,
    is_intact    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    r           record;
    running_hash text := 'genesis';
    computed    text;
    payload     jsonb;
begin
    for r in
        select a.id, a.created_at, a.event, a.chain_hash,
               to_jsonb(a) - 'chain_hash' - 'id' - 'created_at' as content
        from public.audit_log a
        where a.id >= p_from_id
          and (p_to_id is null or a.id <= p_to_id)
          and a.chain_hash is not null
        order by a.id
    loop
        -- Re-derive the canonical JSON string (must match Python's json.dumps sort_keys=True)
        computed := encode(
            digest(running_hash || ':' || r.content::text, 'sha256'),
            'hex'
        );
        return query select
            r.id,
            r.created_at,
            r.event,
            r.chain_hash  as stored_hash,
            running_hash  as prev_hash,
            (r.chain_hash = computed) as is_intact;
        running_hash := computed;
    end loop;
end;
$$;

revoke all on function public.audit_log_verify_chain(bigint, bigint) from public;
grant execute on function public.audit_log_verify_chain(bigint, bigint) to service_role;

-- ─── 7. Convenience view (service role only) ──────────────────────────────────
-- Joins user_id → profile for human-readable admin queries.

create or replace view public.audit_log_enriched as
select
    a.id,
    a.created_at,
    a.event,
    a.user_id,
    p.full_name   as actor_name,
    p.email       as actor_email,
    p.role        as actor_role,
    a.credential,
    a.entity_type,
    a.entity_id,
    a.changes,
    a.ip,
    a.user_agent,
    a.request_id,
    a.success,
    a.error_message,
    a.chain_hash,
    a.meta
from public.audit_log a
left join public.profiles p on p.id = a.user_id;

-- No RLS on views — this view is intentionally not public.
-- Access is only via service-role key (backend).
revoke all on public.audit_log_enriched from anon, authenticated;
grant select on public.audit_log_enriched to service_role;
