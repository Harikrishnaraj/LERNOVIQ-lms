-- Gap audit GAP-123: instructors' payout references are stored as plain text, and the staff read
-- policy from 20260926200000_admin_instructor_detail.sql keyed on `user.read_all`, which support
-- agents hold too. Only roles that can manage users (admin, super_admin) need them, so the policy
-- now keys on `user.manage`. Instructors keep full access to their own row ("own payout details").
--
-- Merge note (2026-10-12): 20261005100000_platform_course_pricing.sql (ADR-037) drops the table
-- first, so this is a no-op wherever that migration ran.

do $$
begin
  if to_regclass('public.instructor_payout_details') is not null then
    drop policy "staff read payout details" on public.instructor_payout_details;
    create policy "staff read payout details" on public.instructor_payout_details for select to authenticated
      using (public.has_permission('user.manage'));
  end if;
end $$;
