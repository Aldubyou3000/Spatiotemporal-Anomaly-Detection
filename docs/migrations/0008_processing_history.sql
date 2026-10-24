-- Apply in Supabase SQL editor before deploying the History feature.
-- Backend service-role only. Original snapshots are immutable; reviews are separate.
begin;

create table if not exists public.processing_runs (
    id uuid primary key,
    processed_by uuid not null references public.profiles(id),
    processed_by_name text not null,
    files jsonb not null,
    station_ids text[] not null,
    summary jsonb not null,
    quality_report jsonb not null,
    algorithm_version text not null,
    flagged_count integer not null,
    flagged_readings jsonb not null,
    search_text text not null,
    processed_at timestamptz not null,
    created_at timestamptz not null default now()
);
create index if not exists processing_runs_processed_idx on public.processing_runs(processed_at desc, id);

create table if not exists public.processing_run_results (
    run_id uuid primary key references public.processing_runs(id) on delete cascade,
    result jsonb not null
);
create table if not exists public.processing_reviews (
    run_id uuid not null references public.processing_runs(id),
    station_id text not null,
    date date not null,
    status text check (status in ('anomaly', 'not_anomaly')),
    note text not null default '' check (length(note) <= 1000),
    reviewer_id uuid not null references public.profiles(id),
    reviewed_by text not null,
    reviewed_at timestamptz not null default now(),
    revision integer not null default 1,
    primary key (run_id, station_id, date)
);

alter table public.tickets add column if not exists run_id uuid references public.processing_runs(id);
alter table public.tickets add column if not exists reading_date date;
alter table public.inspection_reports add column if not exists approved_by uuid references public.profiles(id);
create index if not exists tickets_run_idx on public.tickets(run_id) where run_id is not null;

alter table public.processing_runs enable row level security;
alter table public.processing_run_results enable row level security;
alter table public.processing_reviews enable row level security;
revoke all on public.processing_runs, public.processing_run_results, public.processing_reviews from anon, authenticated;
grant all on public.processing_runs, public.processing_run_results, public.processing_reviews to service_role;

create or replace view public.processing_history with (security_invoker = true) as
select r.id, r.processed_by, r.processed_by_name, r.files, r.station_ids,
    r.summary, r.quality_report, r.algorithm_version, r.flagged_count,
    r.search_text, r.processed_at, r.created_at,
    (select count(*) from public.processing_reviews v where v.run_id = r.id and v.status is not null) as reviewed_count,
    (select count(*) from public.processing_reviews v where v.run_id = r.id and v.status = 'anomaly') as confirmed_count,
    (select count(*) from public.processing_reviews v where v.run_id = r.id and v.status = 'not_anomaly') as dismissed_count,
    (select count(*) from public.tickets t where t.run_id = r.id and t.status not in ('verified', 'cancelled')) as open_tickets,
    (select count(*) from public.tickets t where t.run_id = r.id and t.status = 'verified') as verified_tickets,
    (select count(*) from public.tickets t where t.run_id = r.id and t.status = 'cancelled') as cancelled_tickets
from public.processing_runs r;
revoke all on public.processing_history from anon, authenticated;
grant select on public.processing_history to service_role;

-- Atomic and idempotent: retrying the same server-created ID never overwrites evidence.
create or replace function public.save_processing_run(p_run jsonb, p_result jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare inserted integer;
begin
    insert into processing_runs(id, processed_by, processed_by_name, files, station_ids,
        summary, quality_report, algorithm_version, flagged_count, flagged_readings, search_text, processed_at)
    values ((p_run->>'id')::uuid, (p_run->>'processed_by')::uuid, p_run->>'processed_by_name',
        p_run->'files', array(select jsonb_array_elements_text(p_run->'station_ids')),
        p_run->'summary', p_run->'quality_report', p_run->>'algorithm_version',
        (p_run->>'flagged_count')::integer, p_run->'flagged_readings', p_run->>'search_text', (p_run->>'processed_at')::timestamptz)
    on conflict (id) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 1 then
        insert into processing_run_results(run_id, result) values ((p_run->>'id')::uuid, p_result);
    end if;
    return inserted = 1;
end $$;

-- Tombstones retain revision after Undo; concurrent reviewers cannot overwrite silently.
create or replace function public.save_processing_review(
    p_run_id uuid, p_station_id text, p_date date, p_status text, p_note text,
    p_reviewer_id uuid, p_reviewed_by text, p_expected_revision integer
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare current_revision integer; saved processing_reviews; previous jsonb;
begin
    perform 1 from processing_runs where id = p_run_id for update;
    if not found then raise exception 'Run not found'; end if;
    select revision, to_jsonb(v) into current_revision, previous
        from processing_reviews v where run_id = p_run_id and station_id = p_station_id and date = p_date;
    if coalesce(current_revision, 0) <> p_expected_revision then
        return jsonb_build_object('conflict', true);
    end if;
    insert into processing_reviews(run_id, station_id, date, status, note, reviewer_id, reviewed_by, revision)
    values (p_run_id, p_station_id, p_date, p_status, p_note, p_reviewer_id, p_reviewed_by, coalesce(current_revision, 0) + 1)
    on conflict (run_id, station_id, date) do update set
        status = excluded.status, note = excluded.note, reviewer_id = excluded.reviewer_id,
        reviewed_by = excluded.reviewed_by, reviewed_at = now(), revision = excluded.revision
    returning * into saved;
    return to_jsonb(saved) || jsonb_build_object('previous', previous);
end $$;

revoke all on function public.save_processing_run(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_processing_review(uuid, text, date, text, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.save_processing_run(jsonb, jsonb) to service_role;
grant execute on function public.save_processing_review(uuid, text, date, text, text, uuid, text, integer) to service_role;
commit;
