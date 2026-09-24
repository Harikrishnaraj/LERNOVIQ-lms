-- T-055: prerequisites are enforced in the database, not just in the Server Action, so a direct API
-- insert into enrollments cannot bypass them.

-- True when every prerequisite of the version was COMPLETED by the calling user.
create function public.prerequisites_met(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.course_prerequisites cp
     where cp.version_id = p_version_id
       and not exists (
         select 1 from public.enrollments e
          where e.user_id = auth.uid()
            and e.course_id = cp.prerequisite_course_id
            and e.status = 'completed'
       )
  );
$$;
revoke execute on function public.prerequisites_met(uuid) from public, anon;
grant execute on function public.prerequisites_met(uuid) to authenticated;

drop policy "self-enroll in free published courses" on public.enrollments;
create policy "self-enroll in free published courses" on public.enrollments for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'active'
    and public.prerequisites_met(version_id)
    and exists (
      select 1
        from public.courses c
        join public.course_versions v on v.id = c.published_version_id
       where c.id = course_id and v.id = version_id and v.price_cents = 0
    )
  );

-- Titles of the live version of the given courses (public catalog information), for messages.
create function public.get_prerequisite_titles(p_course_ids uuid[])
returns table (course_id uuid, title text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, v.title
    from public.courses c
    join public.course_versions v on v.id = c.published_version_id
   where c.id = any (p_course_ids);
$$;
grant execute on function public.get_prerequisite_titles(uuid[]) to anon, authenticated;
