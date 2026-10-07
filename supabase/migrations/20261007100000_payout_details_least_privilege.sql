-- Gap audit GAP-123: instructors' payout references are stored as plain text, and the staff read
-- policy from 20260926200000_admin_instructor_detail.sql keyed on `user.read_all`, which support
-- agents hold too. Only roles that can manage users (admin, super_admin) need them, so the policy
-- now keys on `user.manage`. Instructors keep full access to their own row ("own payout details").

drop policy "staff read payout details" on public.instructor_payout_details;

create policy "staff read payout details" on public.instructor_payout_details for select to authenticated
  using (public.has_permission('user.manage'));
