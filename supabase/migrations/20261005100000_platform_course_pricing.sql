-- ADR-037: instructors are not paid through the platform and do not set prices. The platform sells
-- courses: only staff holding the new `course.price` permission can change a course's price, and
-- instructor payout details are no longer collected.

insert into public.permissions (id, description) values
  ('course.price', 'Set the price and currency of any course (the platform sells courses, ADR-037)');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'course.price'),
  ('super_admin', 'course.price');

-- Instructors could write price_cents/currency through their column grants (T-030); take those away
-- so a direct API call cannot set a price either. New versions copy the price from the version they
-- are based on inside create_draft_version (security definer), so drafts keep the platform's price.
revoke insert (price_cents, currency) on public.course_versions from authenticated;
revoke update (price_cents, currency) on public.course_versions from authenticated;

-- Sets the price of every version of a course (live, drafts and history), so a draft that is later
-- published keeps the price the platform chose. Returns the number of versions updated.
create function public.admin_set_course_price(p_course_id uuid, p_price_cents integer, p_currency text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.has_permission('course.price') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_price_cents is null or not (p_price_cents = 0 or p_price_cents between 100 and 999999) then
    raise exception 'invalid price' using errcode = '22023';
  end if;
  if p_currency is null or p_currency not in ('USD', 'EUR', 'GBP', 'INR') then
    raise exception 'invalid currency' using errcode = '22023';
  end if;

  update public.course_versions
     set price_cents = p_price_cents, currency = p_currency
   where course_id = p_course_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'course not found' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;
revoke all on function public.admin_set_course_price(uuid, integer, text) from public, anon;
grant execute on function public.admin_set_course_price(uuid, integer, text) to authenticated;

-- Payout details were a placeholder for instructor payouts (T-112/T-186), now descoped.
drop table public.instructor_payout_details;
