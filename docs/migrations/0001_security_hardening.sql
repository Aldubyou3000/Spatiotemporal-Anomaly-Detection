-- Migration: Security hardening — audit_log table + hardened RPC
-- Run this in the Supabase SQL editor (or via supabase db push).
-- Safe to run multiple times (idempotent).

-- ─── 1. audit_log ─────────────────────────────────────────────────────────────
-- Append-only log of security-relevant events (login, logout, lockout, etc.)
-- Written by the backend via the service-role key; read by admins only.

create table if not exists public.audit_log (
    id          bigint generated always as identity primary key,
    created_at  timestamptz not null default now(),
    event       text        not null,          -- e.g. 'login_success', 'login_failed', 'lockout'
    user_id     uuid        references auth.users(id) on delete set null,
    credential  text,                          -- normalised username/email (not password)
    ip          text,
    user_agent  text,
    meta        jsonb
);

-- No SELECT for anon/authenticated — only service role can write/read
alter table public.audit_log enable row level security;

-- Service role bypasses RLS by design; no explicit policy needed for it.
-- Deny everything for all other roles:
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'audit_log' and policyname = 'deny_all'
    ) then
        execute 'create policy deny_all on public.audit_log for all using (false)';
    end if;
end $$;

-- Prevent accidental updates / deletes (append-only guarantee)
create or replace rule audit_log_no_update as on update to public.audit_log do instead nothing;
create or replace rule audit_log_no_delete as on delete to public.audit_log do instead nothing;

-- Index for querying by user and time
create index if not exists idx_audit_log_user_created on public.audit_log (user_id, created_at desc);
create index if not exists idx_audit_log_event_created on public.audit_log (event, created_at desc);


-- ─── 2. Hardened get_email_by_username ────────────────────────────────────────
-- SECURITY DEFINER so the function executes as the owner (postgres / service),
-- not as the calling anon role.  This prevents the caller from directly
-- querying the profiles table.
--
-- Returns the email only if the profile is active and has a recognised role.
-- Returns NULL (not an error) for unknown usernames so timing is uniform.

create or replace function public.get_email_by_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text;
begin
    select email
    into v_email
    from public.profiles
    where lower(username) = lower(trim(p_username))
      and is_active = true
      and role in ('analyst', 'technician')
    limit 1;

    return v_email;  -- NULL if not found
end;
$$;

-- Only anon and service roles need to call this
revoke all on function public.get_email_by_username(text) from public;
grant execute on function public.get_email_by_username(text) to anon, service_role;
