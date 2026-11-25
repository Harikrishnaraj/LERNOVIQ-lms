-- Report audit C17: an owner could insert a report_exports row pointing at any file in the
-- report-exports bucket (e.g. another admin's 'scheduled/...' export) and backdate generated_at, so
-- the retention purge (service role) deleted that file. Owners may now only record a manual export
-- stored under their own '<user id>/<report id>/' folder, stamped with the current time.
-- The scheduled-reports cron writes with the service role (RLS bypassed), so its 'scheduled/...'
-- rows are unaffected.

drop policy "insert own report exports" on public.report_exports;

create policy "insert own report exports" on public.report_exports for insert to authenticated
  with check (
    exists (select 1 from public.saved_reports sr where sr.id = saved_report_id and sr.owner_id = auth.uid())
    and starts_with(storage_path, auth.uid()::text || '/' || saved_report_id::text || '/')
    and triggered_by = 'manual'
    and generated_at between now() - interval '1 minute' and now() + interval '1 minute'
  );
