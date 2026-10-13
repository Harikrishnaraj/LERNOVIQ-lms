-- T-222 (F-801, ADR-017, ADR-042, SECURITY §16): permission-aware retrieval for the AI Tutor.
--
-- match_knowledge_chunks is the only way a user reaches knowledge_chunks (the table itself grants
-- clients nothing). It works out what the caller may read from auth.uid() - never from parameters -
-- and applies that scope in the WHERE clause before ranking, so another organization's or course's
-- passages are never fetched, ranked or returned:
--   * course content: versions the caller is enrolled in (not cancelled), courses the caller owns,
--     or every course with course.read_all (admin test retrieval, T-223). This mirrors
--     can_read_lesson, minus preview lessons: the tutor answers enrolled learners only;
--   * organization documents: the caller's own organization;
--   * platform-wide documents: every signed-in user.
-- p_course_id narrows course content to one course (the tutor's current course); document
-- passages stay eligible. Ranking is keyword-first (ADR-042): passages matching every word of the
-- question come first, then passages matching some of them, by ts_rank_cd.

create function public.match_knowledge_chunks(
  p_query text,
  p_course_id uuid default null,
  p_limit int default 8
)
returns table (
  chunk_id uuid,
  source_id uuid,
  lesson_id uuid,
  course_version_id uuid,
  organization_id uuid,
  title text,
  content text,
  rank real
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_query text := left(coalesce(p_query, ''), 500);
  v_all tsquery;
  v_any tsquery;
  v_or text;
  v_read_all boolean;
begin
  if v_uid is null then
    return;
  end if;

  v_all := websearch_to_tsquery('english', v_query);
  -- OR of the question's lexemes, already stemmed by the english config; 'simple' keeps them as-is.
  select string_agg(quote_literal(lexeme), ' | ')
    into v_or
    from unnest(tsvector_to_array(to_tsvector('english', v_query))) lexeme;
  if v_or is null then
    return; -- empty, or only stop words
  end if;
  v_any := to_tsquery('simple', v_or);
  v_read_all := public.has_permission('course.read_all');

  return query
  with allowed_versions as (
    select e.version_id as id
      from public.enrollments e
     where e.user_id = v_uid and e.status <> 'cancelled'
    union
    select v.id
      from public.course_versions v
      join public.courses c on c.id = v.course_id
     where c.instructor_id = v_uid
  ), allowed_orgs as (
    select m.organization_id as id from public.organization_members m where m.user_id = v_uid
  ), course_versions_filter as (
    select v.id from public.course_versions v where v.course_id = p_course_id
  )
  select k.id, k.source_id, k.lesson_id, k.course_version_id, k.organization_id, s.title, k.content,
         ts_rank_cd(k.fts, v_any, 32)
    from public.knowledge_chunks k
    join public.knowledge_sources s on s.id = k.source_id
   where k.fts @@ v_any
     and (
           (k.course_version_id is not null
             and (v_read_all or k.course_version_id in (select id from allowed_versions))
             and (p_course_id is null or k.course_version_id in (select id from course_versions_filter)))
        or (k.organization_id is not null and k.organization_id in (select id from allowed_orgs))
        or (k.course_version_id is null and k.organization_id is null)
         )
   order by (k.fts @@ v_all) desc, ts_rank_cd(k.fts, v_any, 32) desc, k.source_id, k.position
   limit least(greatest(coalesce(p_limit, 8), 1), 20);
end;
$$;

revoke all on function public.match_knowledge_chunks(text, uuid, int) from public, anon;
grant execute on function public.match_knowledge_chunks(text, uuid, int) to authenticated;
