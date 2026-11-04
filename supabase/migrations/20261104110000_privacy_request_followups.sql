-- T-297 (F-449): remember which reminder went out, so each request is announced once per stage.
alter table public.subject_requests
  add column reminded_due_soon_at timestamptz,
  add column reminded_overdue_at timestamptz;

-- T-298 (F-449): an erasure request handled by staff points at the account deletion it started.
alter table public.subject_requests
  add column deletion_started_at timestamptz;
