-- Migration: Persist OAuth PKCE states to survive --reload restarts
-- Run AFTER 0006. Safe to re-run (idempotent).
-- Execute in the Supabase SQL editor.
--
-- WHY: The OAuth PKCE flow stores {state -> (code_verifier, return_url)} in an
-- in-memory dict keyed by the `state` nonce embedded in the callback URL.
-- With `uvicorn --reload` (dev) any file change restarts the worker and wipes the
-- dict, so an in-flight Google sign-in dies at the callback with
-- "oauth state lookup failed" and the app never receives tokens. Persisting to
-- Postgres makes the flow survive reloads and matches the single-worker SSE
-- constraint's documented multi-worker upgrade path.
--

create table if not exists public.oauth_states (
  state         text        primary key,
  code_verifier text        not null,
  return_url    text,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

-- Service role bypasses RLS; no other role may touch this table.
alter table public.oauth_states enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'oauth_states' and policyname = 'deny_all'
  ) then
    execute 'create policy deny_all on public.oauth_states for all using (false)';
  end if;
end $$;

-- Index for expiry GC and lookups
create index if not exists idx_oauth_states_expires_at
  on public.oauth_states (expires_at);

-- Optional cleanup function (call manually or via pg_cron)
create or replace function public.oauth_states_cleanup()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted bigint;
begin
  delete from public.oauth_states where expires_at < now();
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.oauth_states_cleanup() from public, anon, authenticated;
grant execute on function public.oauth_states_cleanup() to service_role;

-- One-off GC of any pre-existing expired rows (no-op on fresh table)
select public.oauth_states_cleanup();
