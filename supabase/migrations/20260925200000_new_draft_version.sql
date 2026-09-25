-- T-102 (ADR-011): editing a live course creates a new draft version instead of changing the
-- published one. create_draft_version deep-copies the newest version (sections, lessons,
-- attachments, assessments with answer keys, assignments with rubrics, prerequisites, settings) into
-- version_number + 1 as a draft. Learners already enrolled stay pinned to the version they enrolled
-- in; the new version replaces it in the catalog only when a reviewer publishes it.

create function public.create_draft_version(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  src public.course_versions;
  v_new uuid;
  sec record;
  les record;
  a record;
  q record;
  o record;
  v_sec uuid;
  v_les uuid;
  v_a uuid;
  v_q uuid;
  v_opt uuid;
  v_correct uuid[];
  key_row public.assessment_answer_keys;
begin
  if auth.uid() is null or not exists (
    select 1 from public.courses c where c.id = p_course_id and c.instructor_id = auth.uid()
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into src from public.course_versions
   where course_id = p_course_id order by version_number desc limit 1;
  if not found then raise exception 'course has no version' using errcode = '22023'; end if;
  if src.status not in ('published', 'archived') then
    raise exception 'the newest version is already being edited' using errcode = '22023';
  end if;

  insert into public.course_versions
    (course_id, version_number, status, title, subtitle, description, level, language, thumbnail_url,
     price_cents, currency, outcomes, requirements, certificate_enabled, visibility)
  values
    (p_course_id, src.version_number + 1, 'draft', src.title, src.subtitle, src.description, src.level, src.language,
     src.thumbnail_url, src.price_cents, src.currency, src.outcomes, src.requirements, src.certificate_enabled, src.visibility)
  returning id into v_new;

  create temp table _lesson_map (old_id uuid primary key, new_id uuid) on commit drop;

  for sec in select * from public.course_sections where version_id = src.id order by position loop
    insert into public.course_sections (version_id, title, position) values (v_new, sec.title, sec.position)
    returning id into v_sec;
    for les in select * from public.lessons where section_id = sec.id order by position loop
      insert into public.lessons (section_id, title, type, position, content, video_url, duration_minutes, is_preview)
      values (v_sec, les.title, les.type, les.position, les.content, les.video_url, les.duration_minutes, les.is_preview)
      returning id into v_les;
      insert into _lesson_map values (les.id, v_les);
      insert into public.lesson_assets (lesson_id, name, storage_path, mime_type, size_bytes)
        select v_les, name, storage_path, mime_type, size_bytes from public.lesson_assets where lesson_id = les.id;
    end loop;
  end loop;

  for a in select * from public.assessments where version_id = src.id order by position loop
    insert into public.assessments (version_id, lesson_id, title, description, pass_mark, max_attempts, time_limit_minutes, position)
    values (v_new, (select new_id from _lesson_map where old_id = a.lesson_id), a.title, a.description, a.pass_mark,
            a.max_attempts, a.time_limit_minutes, a.position)
    returning id into v_a;
    for q in select * from public.assessment_questions where assessment_id = a.id order by position loop
      insert into public.assessment_questions (assessment_id, type, prompt, points, position)
      values (v_a, q.type, q.prompt, q.points, q.position) returning id into v_q;
      select * into key_row from public.assessment_answer_keys where question_id = q.id;
      v_correct := '{}';
      for o in select * from public.assessment_options where question_id = q.id order by position loop
        insert into public.assessment_options (question_id, label, position) values (v_q, o.label, o.position)
        returning id into v_opt;
        if key_row.correct_option_ids is not null and o.id = any (key_row.correct_option_ids) then
          v_correct := v_correct || v_opt;
        end if;
      end loop;
      insert into public.assessment_answer_keys (question_id, correct_option_ids, accepted_answers, explanation)
      values (v_q, v_correct, coalesce(key_row.accepted_answers, '{}'), coalesce(key_row.explanation, ''));
    end loop;
  end loop;

  for a in select * from public.assignments where version_id = src.id order by position loop
    insert into public.assignments (version_id, lesson_id, title, instructions, due_at, max_points, allow_late,
                                    allow_text, allow_file, max_file_mb, position)
    values (v_new, (select new_id from _lesson_map where old_id = a.lesson_id), a.title, a.instructions, a.due_at,
            a.max_points, a.allow_late, a.allow_text, a.allow_file, a.max_file_mb, a.position)
    returning id into v_a;
    insert into public.assignment_rubric_criteria (assignment_id, position, title, description, max_points)
      select v_a, position, title, description, max_points
        from public.assignment_rubric_criteria where assignment_id = a.id;
  end loop;

  insert into public.course_prerequisites (version_id, prerequisite_course_id)
    select v_new, prerequisite_course_id from public.course_prerequisites where version_id = src.id;

  return v_new;
end;
$$;

revoke all on function public.create_draft_version(uuid) from public, anon;
grant execute on function public.create_draft_version(uuid) to authenticated;
