-- Migration: Lock down SECURITY DEFINER RPC execute grants
-- Run this in the Supabase SQL editor. Safe to run multiple times (idempotent).
--
-- WHY THIS EXISTS
-- ───────────────
-- The Supabase security advisor flagged four SECURITY DEFINER functions in the
-- `public` schema as executable by the `anon` and/or `authenticated` roles via
-- PostgREST (`/rest/v1/rpc/<fn>`). The most serious is `rls_auto_enable`, which
-- could be executed by PUBLIC (anyone holding the semi-public anon key) — a
-- function that toggles Row-Level Security is a privilege-escalation primitive.
--
-- Note: migration 0002 already ran `revoke all ... from public` for two of these,
-- but in Postgres `PUBLIC`, `anon`, and `authenticated` are DISTINCT grantees and
-- Supabase's default privileges auto-grant EXECUTE to `anon`/`authenticated` on
-- functions created in `public`. `REVOKE ... FROM public` does not remove those
-- explicit role grants — so we must revoke from each role by name.
--
-- POLICY
-- ──────
--   * audit_log_cleanup / audit_log_verify_chain / rls_auto_enable  → service_role ONLY
--   * get_email_by_username  → anon ONLY (needed for username→email at login;
--                              a signed-in user never needs it, so revoke authenticated)
--
-- Each statement is wrapped so a missing function (e.g. rls_auto_enable was created
-- ad-hoc and may not exist in every environment) does not abort the migration.

do $$
begin
  -- ── Maintenance functions: service_role only ──────────────────────────────
  if to_regprocedure('public.audit_log_cleanup(integer)') is not null then
    execute 'revoke all on function public.audit_log_cleanup(integer) from public, anon, authenticated';
    execute 'grant execute on function public.audit_log_cleanup(integer) to service_role';
  end if;

  if to_regprocedure('public.audit_log_verify_chain(bigint, bigint)') is not null then
    execute 'revoke all on function public.audit_log_verify_chain(bigint, bigint) from public, anon, authenticated';
    execute 'grant execute on function public.audit_log_verify_chain(bigint, bigint) to service_role';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
    execute 'grant execute on function public.rls_auto_enable() to service_role';
  end if;

  -- ── Login helper: anon only (revoke authenticated, keep anon) ──────────────
  if to_regprocedure('public.get_email_by_username(text)') is not null then
    -- Reset, then grant precisely the roles that need it.
    execute 'revoke all on function public.get_email_by_username(text) from public, anon, authenticated';
    execute 'grant execute on function public.get_email_by_username(text) to anon, service_role';
  end if;
end $$;

-- ── Verification (run after applying) ────────────────────────────────────────
-- Expect: maintenance fns show only service_role; get_email_by_username shows
-- anon + service_role; none show authenticated, none show the empty (PUBLIC) entry.
--
--   select p.proname,
--          pg_get_function_identity_arguments(p.oid) as args,
--          array_to_string(p.proacl::text[], ' | ') as acl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('audit_log_cleanup','audit_log_verify_chain',
--                        'rls_auto_enable','get_email_by_username')
--   order by p.proname;
