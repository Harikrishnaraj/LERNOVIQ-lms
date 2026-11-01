-- T-290 (F-421): filters stored with a saved report. Shape is validated in TypeScript
-- (report-filters.ts: courseId, userId, organizationId, status); the database only guarantees
-- it is a JSON object so a bad value can never break a scheduled run.
alter table public.saved_reports
  add column filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object');
