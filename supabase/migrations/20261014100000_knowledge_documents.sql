-- T-221 + T-223 (F-800, F-802, ADR-017, SECURITY §9/§16): uploaded documents in the AI Tutor
-- knowledge base, and the admin Knowledge Base screen.
--
-- * Permission `knowledge.manage` (admin, super_admin): upload, re-index, delete and test sources.
-- * Private bucket `knowledge-documents` (PDF, DOCX, TXT, Markdown; 10 MB). No storage.objects
--   policies: the browser uploads through a server-issued signed upload URL, and only the
--   indexing worker (service role) reads the files back.
-- * knowledge_sources gains the uploaded file's storage path, MIME type, size and name.
-- * claim_knowledge_jobs can be narrowed to one source (tests, and the E2E run).
-- * Service-role-only writers: create_document_source and requeue_knowledge_source. The admin
--   server actions call them only after checking the caller holds knowledge.manage.
-- * Admin readers that run on the admin's own session and check knowledge.manage themselves
--   (the tables stay closed to every client role): admin_list_knowledge_sources,
--   admin_knowledge_status_counts and admin_match_knowledge_chunks (test retrieval across every
--   organization - match_knowledge_chunks itself is unchanged and keeps scoping learners).

insert into public.permissions (id, description) values
  ('knowledge.manage', 'Manage the AI Tutor knowledge base: upload, re-index, delete and test sources');
insert into public.role_permissions (role_id, permission_id) values
  ('admin', 'knowledge.manage'),
  ('super_admin', 'knowledge.manage');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('knowledge-documents', 'knowledge-documents', false, 10485760, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.knowledge_sources
  add column storage_path text unique check (storage_path is null or char_length(storage_path) <= 300),
  add column mime_type text check (mime_type is null or mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  )),
  add column byte_size bigint check (byte_size is null or byte_size between 1 and 10485760),
  add column file_name text check (file_name is null or char_length(file_name) between 1 and 200),
  -- Only uploaded documents carry a file, and a file always comes with its type.
  add constraint knowledge_sources_file_check
    check (storage_path is null or (kind = 'document' and mime_type is not null));

-- Same as before, plus p_source_id: claim only that source's jobs.
drop function public.claim_knowledge_jobs(int, uuid);
create function public.claim_knowledge_jobs(
  p_limit int default 10,
  p_version_id uuid default null,
  p_source_id uuid default null
)
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
       and (p_source_id is null or k.id = p_source_id)
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

-- An uploaded document: its source (pending) and its first job, in one transaction.
create function public.create_document_source(
  p_title text,
  p_organization_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_file_name text,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.knowledge_sources (
    kind, organization_id, title, storage_path, mime_type, byte_size, file_name, created_by
  ) values (
    'document', p_organization_id, btrim(p_title), p_storage_path, p_mime_type, p_byte_size,
    p_file_name, p_created_by
  )
  returning id into v_id;
  insert into public.knowledge_jobs (source_id) values (v_id);
  return v_id;
end;
$$;

-- Re-index: forget the content hash (so unchanged text is re-chunked too), mark the source
-- pending and queue a job now. Returns 'queued', 'running' (a live job is already indexing it:
-- nothing to do) or 'not_found'.
create function public.requeue_knowledge_source(p_source_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id uuid;
  v_job_id uuid;
begin
  select id into v_source_id from public.knowledge_sources where id = p_source_id for update;
  if v_source_id is null then
    return 'not_found';
  end if;

  if exists (
    select 1 from public.knowledge_jobs
     where source_id = p_source_id and status = 'running'
       and locked_at >= now() - interval '15 minutes'
  ) then
    return 'running';
  end if;

  update public.knowledge_sources
     set content_hash = null, status = 'pending', error = null
   where id = p_source_id;

  -- Reuse a waiting (or crashed) job, otherwise add one; a source never has two active jobs.
  select id into v_job_id
    from public.knowledge_jobs
   where source_id = p_source_id and status in ('queued', 'running')
   order by created_at desc
   limit 1
   for update;
  if v_job_id is null then
    insert into public.knowledge_jobs (source_id) values (p_source_id);
  else
    update public.knowledge_jobs
       set status = 'queued', attempts = 0, run_after = now(), last_error = null, locked_at = null
     where id = v_job_id;
  end if;
  return 'queued';
end;
$$;

-- Admin Knowledge Base list (T-223). Runs on the admin's session; the permission check is here
-- because the tables grant clients nothing.
create function public.admin_list_knowledge_sources(
  p_status text default null,
  p_kind text default null,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  kind text,
  title text,
  status text,
  error text,
  chunk_count int,
  course_version_id uuid,
  course_id uuid,
  course_title text,
  version_number int,
  organization_id uuid,
  organization_name text,
  lesson_id uuid,
  file_name text,
  mime_type text,
  byte_size bigint,
  attempts int,
  created_at timestamptz,
  updated_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_search text := nullif(lower(btrim(left(coalesce(p_search, ''), 100))), '');
begin
  if not public.has_permission('knowledge.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  return query
  select s.id, s.kind, s.title, s.status, s.error, s.chunk_count,
         s.course_version_id, v.course_id, v.title, v.version_number,
         s.organization_id, o.name,
         s.lesson_id, s.file_name, s.mime_type, s.byte_size,
         (select j.attempts from public.knowledge_jobs j
           where j.source_id = s.id order by j.created_at desc limit 1),
         s.created_at, s.updated_at,
         count(*) over ()
    from public.knowledge_sources s
    left join public.course_versions v on v.id = s.course_version_id
    left join public.organizations o on o.id = s.organization_id
   where (p_status is null or s.status = p_status)
     and (p_kind is null or s.kind = p_kind)
     and (v_search is null
          or position(v_search in lower(s.title)) > 0
          or position(v_search in lower(coalesce(v.title, ''))) > 0
          or position(v_search in lower(coalesce(s.file_name, ''))) > 0)
   order by s.updated_at desc, s.id
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.admin_knowledge_status_counts()
returns table (kind text, status text, n bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.has_permission('knowledge.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
  select s.kind, s.status, count(*) from public.knowledge_sources s group by s.kind, s.status;
end;
$$;

-- Admin test retrieval (T-223): the same keyword ranking as match_knowledge_chunks, but over every
-- course and organization, because an admin debugging the knowledge base must see what any
-- learner could be shown. Gated by knowledge.manage (checked here, from auth.uid()), never by a
-- service-role bypass of the learner function. p_course_id narrows course content to one course;
-- p_organization_id narrows organization documents to one organization (platform documents always
-- stay eligible, as they are for every learner).
create function public.admin_match_knowledge_chunks(
  p_query text,
  p_course_id uuid default null,
  p_organization_id uuid default null,
  p_limit int default 8
)
returns table (
  chunk_id uuid,
  source_id uuid,
  kind text,
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
  v_query text := left(coalesce(p_query, ''), 500);
  v_all tsquery;
  v_any tsquery;
  v_or text;
begin
  if not public.has_permission('knowledge.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  v_all := websearch_to_tsquery('english', v_query);
  select string_agg(quote_literal(lexeme), ' | ')
    into v_or
    from unnest(tsvector_to_array(to_tsvector('english', v_query))) lexeme;
  if v_or is null then
    return;
  end if;
  v_any := to_tsquery('simple', v_or);

  return query
  select k.id, k.source_id, s.kind, k.lesson_id, k.course_version_id, k.organization_id, s.title,
         k.content, ts_rank_cd(k.fts, v_any, 32)
    from public.knowledge_chunks k
    join public.knowledge_sources s on s.id = k.source_id
   where k.fts @@ v_any
     and (
           (k.course_version_id is not null
             and (p_course_id is null
                  or k.course_version_id in (select v.id from public.course_versions v where v.course_id = p_course_id)))
        or (k.organization_id is not null
             and (p_organization_id is null or k.organization_id = p_organization_id))
        or (k.course_version_id is null and k.organization_id is null)
         )
   order by (k.fts @@ v_all) desc, ts_rank_cd(k.fts, v_any, 32) desc, k.source_id, k.position
   limit least(greatest(coalesce(p_limit, 8), 1), 20);
end;
$$;

revoke all on function public.claim_knowledge_jobs(int, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_document_source(text, uuid, text, text, bigint, text, uuid) from public, anon, authenticated;
revoke all on function public.requeue_knowledge_source(uuid) from public, anon, authenticated;
grant execute on function public.claim_knowledge_jobs(int, uuid, uuid) to service_role;
grant execute on function public.create_document_source(text, uuid, text, text, bigint, text, uuid) to service_role;
grant execute on function public.requeue_knowledge_source(uuid) to service_role;

revoke all on function public.admin_list_knowledge_sources(text, text, text, int, int) from public, anon;
revoke all on function public.admin_knowledge_status_counts() from public, anon;
revoke all on function public.admin_match_knowledge_chunks(text, uuid, uuid, int) from public, anon;
grant execute on function public.admin_list_knowledge_sources(text, text, text, int, int) to authenticated;
grant execute on function public.admin_knowledge_status_counts() to authenticated;
grant execute on function public.admin_match_knowledge_chunks(text, uuid, uuid, int) to authenticated;
