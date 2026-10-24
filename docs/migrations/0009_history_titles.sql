-- Apply after 0008. Explicit saves now require a title; older runs retain a filename fallback.
begin;
alter table public.processing_runs add column if not exists title text;
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'processing_runs_title_length' and conrelid = 'public.processing_runs'::regclass) then
        alter table public.processing_runs add constraint processing_runs_title_length
            check (title is null or char_length(btrim(title)) between 1 and 120);
    end if;
end $$;

-- Keep existing view column order; PostgreSQL allows new columns at the end.
create or replace view public.processing_history with (security_invoker = true) as
select r.id, r.processed_by, r.processed_by_name, r.files, r.station_ids,
    r.summary, r.quality_report, r.algorithm_version, r.flagged_count,
    r.search_text, r.processed_at, r.created_at,
    (select count(*) from public.processing_reviews v where v.run_id = r.id and v.status is not null) as reviewed_count,
    (select count(*) from public.processing_reviews v where v.run_id = r.id and v.status = 'anomaly') as confirmed_count,
    (select count(*) from public.processing_reviews v where v.run_id = r.id and v.status = 'not_anomaly') as dismissed_count,
    (select count(*) from public.tickets t where t.run_id = r.id and t.status not in ('verified', 'cancelled')) as open_tickets,
    (select count(*) from public.tickets t where t.run_id = r.id and t.status = 'verified') as verified_tickets,
    (select count(*) from public.tickets t where t.run_id = r.id and t.status = 'cancelled') as cancelled_tickets,
    r.title
from public.processing_runs r;
revoke all on public.processing_history from anon, authenticated;
grant select on public.processing_history to service_role;

-- The explicit third argument makes old schemas reject titled saves rather than silently dropping titles.
create or replace function public.save_processing_run(p_run jsonb, p_result jsonb, p_title text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare inserted integer; run_title text := btrim(p_title);
begin
    if run_title is null or char_length(run_title) not between 1 and 120 then
        raise exception 'A title of 1 to 120 characters is required' using errcode = '23514';
    end if;
    insert into processing_runs(id, title, processed_by, processed_by_name, files, station_ids,
        summary, quality_report, algorithm_version, flagged_count, flagged_readings, search_text, processed_at)
    values ((p_run->>'id')::uuid, run_title, (p_run->>'processed_by')::uuid, p_run->>'processed_by_name',
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
revoke all on function public.save_processing_run(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_processing_run(jsonb, jsonb, text) to service_role;
commit;
