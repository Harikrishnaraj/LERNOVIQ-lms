-- T-221 (F-800, ADR-042): lesson indexing pipeline for AI Tutor search.
--
-- The worker (/api/cron/knowledge-ingest, run every minute) calls these functions with the service
-- role, in this order:
--   1. enqueue_lesson_sources: every lesson of a published (or archived) course version that has no
--      knowledge source yet gets one, plus a queued job. Running it every minute covers newly
--      published courses and back-fills courses published before this feature existed. Published
--      versions are immutable (ADR-011), so a lesson never needs re-indexing after its version is out.
--   2. claim_knowledge_jobs: claims due jobs with FOR UPDATE SKIP LOCKED, so overlapping runs never
--      process the same job. A job stuck in "running" for 15 minutes (crashed worker) is reclaimed.
--   3. complete_knowledge_job / fail_knowledge_job: replace the source's chunks in one transaction,
--      or retry with backoff and finally mark the source failed with its error (F-800).
-- Deleting a lesson or a course version removes its source, chunks and jobs (FK cascades).

create function public.enqueue_lesson_sources(p_version_id uuid default null, p_limit int default 500)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with missing as (
    select l.id as lesson_id, s.version_id, l.title
      from public.lessons l
      join public.course_sections s on s.id = l.section_id
      join public.course_versions v on v.id = s.version_id
     where v.status in ('published', 'archived')
       and (p_version_id is null or v.id = p_version_id)
       and not exists (
         select 1 from public.knowledge_sources k where k.kind = 'lesson' and k.lesson_id = l.id
       )
     order by v.published_at nulls last, s.position, l.position
     limit greatest(p_limit, 0)
  ), inserted as (
    insert into public.knowledge_sources (kind, course_version_id, lesson_id, title)
    select 'lesson', version_id, lesson_id, title from missing
    on conflict (lesson_id) where kind = 'lesson' do nothing
    returning id
  ), jobs as (
    insert into public.knowledge_jobs (source_id)
    select id from inserted
    returning id
  )
  select count(*) into v_count from jobs;
  return v_count;
end;
$$;

create function public.claim_knowledge_jobs(p_limit int default 10, p_version_id uuid default null)
returns table (job_id uuid, source_id uuid, attempts int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select j.id
      from public.knowledge_jobs j
      join public.knowledge_sources k on k.id = j.source_id
     where (
             (j.status = 'queued' and j.run_after <= now())
             or (j.status = 'running' and j.locked_at < now() - interval '15 minutes')
           )
       and (p_version_id is null or k.course_version_id = p_version_id)
     order by j.run_after
     limit greatest(p_limit, 0)
     for update of j skip locked
  ), claimed as (
    update public.knowledge_jobs j
       set status = 'running', attempts = j.attempts + 1, locked_at = now()
      from due
     where j.id = due.id
    returning j.id, j.source_id, j.attempts
  ), marked as (
    update public.knowledge_sources k
       set status = 'processing'
      from claimed
     where k.id = claimed.source_id
    returning k.id
  )
  select c.id, c.source_id, c.attempts from claimed c;
end;
$$;

-- p_chunks: [{ position, content, token_count, content_hash, embedding?, embedding_model? }], or null
-- to keep the existing chunks (the text is unchanged since the last successful run).
create function public.complete_knowledge_job(p_job_id uuid, p_content_hash text, p_chunks jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_source public.knowledge_sources;
begin
  select k.* into v_source
    from public.knowledge_sources k
    join public.knowledge_jobs j on j.source_id = k.id
   where j.id = p_job_id and j.status = 'running';
  if v_source.id is null then
    raise exception 'job % is not running', p_job_id using errcode = 'P0002';
  end if;

  if p_chunks is not null then
    delete from public.knowledge_chunks where source_id = v_source.id;
    insert into public.knowledge_chunks (
      source_id, course_version_id, organization_id, lesson_id, position, content, token_count,
      content_hash, embedding, embedding_model
    )
    select v_source.id, v_source.course_version_id, v_source.organization_id, v_source.lesson_id,
           (c ->> 'position')::int, c ->> 'content', (c ->> 'token_count')::int, c ->> 'content_hash',
           (c ->> 'embedding')::extensions.vector, c ->> 'embedding_model'
      from jsonb_array_elements(p_chunks) c;
  end if;

  update public.knowledge_sources
     set status = 'ready',
         error = null,
         content_hash = p_content_hash,
         chunk_count = (select count(*) from public.knowledge_chunks where source_id = v_source.id)
   where id = v_source.id;

  update public.knowledge_jobs
     set status = 'succeeded', last_error = null, locked_at = null
   where id = p_job_id;
end;
$$;

create function public.fail_knowledge_job(p_job_id uuid, p_error text, p_max_attempts int default 3)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.knowledge_jobs;
  v_error text := left(coalesce(p_error, 'unknown error'), 1000);
begin
  select * into v_job from public.knowledge_jobs where id = p_job_id and status = 'running';
  if v_job.id is null then
    raise exception 'job % is not running', p_job_id using errcode = 'P0002';
  end if;

  if v_job.attempts >= p_max_attempts then
    update public.knowledge_jobs set status = 'failed', last_error = v_error, locked_at = null where id = p_job_id;
    update public.knowledge_sources set status = 'failed', error = v_error where id = v_job.source_id;
    return 'failed';
  end if;

  -- Retry after 2, 4, 8… minutes.
  update public.knowledge_jobs
     set status = 'queued', last_error = v_error, locked_at = null,
         run_after = now() + make_interval(mins => power(2, v_job.attempts)::int)
   where id = p_job_id;
  update public.knowledge_sources set status = 'pending', error = v_error where id = v_job.source_id;
  return 'retrying';
end;
$$;

revoke all on function public.enqueue_lesson_sources(uuid, int) from public, anon, authenticated;
revoke all on function public.claim_knowledge_jobs(int, uuid) from public, anon, authenticated;
revoke all on function public.complete_knowledge_job(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_knowledge_job(uuid, text, int) from public, anon, authenticated;
grant execute on function public.enqueue_lesson_sources(uuid, int) to service_role;
grant execute on function public.claim_knowledge_jobs(int, uuid) to service_role;
grant execute on function public.complete_knowledge_job(uuid, text, jsonb) to service_role;
grant execute on function public.fail_knowledge_job(uuid, text, int) to service_role;
