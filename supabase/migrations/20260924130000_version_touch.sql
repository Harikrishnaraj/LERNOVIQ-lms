-- T-052: editing sections/lessons keeps the parent version's updated_at and total duration current
-- (My Courses "Updated", catalog duration filter). Runs as definer because instructors have no
-- column privilege on course_versions.duration_minutes.
create function public.refresh_version(p_version_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.course_versions v
     set duration_minutes = coalesce((
           select sum(l.duration_minutes)::int
             from public.lessons l
             join public.course_sections s on s.id = l.section_id
            where s.version_id = v.id
         ), 0)
   where v.id = p_version_id;
$$;
revoke execute on function public.refresh_version(uuid) from public, anon, authenticated;

create function public.section_refresh_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_version(coalesce(new.version_id, old.version_id));
  return null;
end;
$$;

create function public.lesson_refresh_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_op <> 'INSERT' then
    select version_id into v_old from public.course_sections where id = old.section_id;
  end if;
  if tg_op <> 'DELETE' then
    select version_id into v_new from public.course_sections where id = new.section_id;
  end if;
  if v_new is not null then perform public.refresh_version(v_new); end if;
  if v_old is not null and v_old is distinct from v_new then perform public.refresh_version(v_old); end if;
  return null;
end;
$$;

create trigger course_sections_refresh_version
  after insert or update or delete on public.course_sections
  for each row execute function public.section_refresh_version();
create trigger lessons_refresh_version
  after insert or update or delete on public.lessons
  for each row execute function public.lesson_refresh_version();
