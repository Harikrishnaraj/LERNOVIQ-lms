-- T-030 follow-up (Supabase security advisors): replace the security-definer view with an
-- explicit function, pin set_updated_at search_path, trim anon EXECUTE grants.
drop view if exists public.lesson_outline;

-- Curriculum outline for the public course page: titles/durations only, never lesson content.
create function public.get_lesson_outline(p_version_id uuid)
returns table (id uuid, section_id uuid, title text, type text, "position" int, duration_minutes int, is_preview boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.section_id, l.title, l.type, l.position, l.duration_minutes, l.is_preview
    from public.lessons l
    join public.course_sections s on s.id = l.section_id
   where s.version_id = p_version_id
     and public.version_is_published(p_version_id)
   order by s.position, l.position;
$$;
grant execute on function public.get_lesson_outline(uuid) to anon, authenticated;

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.can_edit_version(uuid), public.is_enrolled_in_version_course(uuid) from anon;
