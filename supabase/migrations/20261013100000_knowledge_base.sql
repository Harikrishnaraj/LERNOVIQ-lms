-- T-220 (F-800, ADR-017, ADR-042): knowledge base schema for AI Tutor retrieval (RAG).
--
-- knowledge_sources: one row per thing that gets indexed (a published lesson, later an uploaded
--   document). Its scope is a course version, an organization, or platform-wide.
-- knowledge_chunks: the searchable passages with their embedding. The scope columns are copied
--   from the source so retrieval filters without joins (T-222).
-- knowledge_jobs: the indexing work queue, claimed with FOR UPDATE SKIP LOCKED (T-221).
--
-- No client access at all: RLS is on and nothing is granted to anon or authenticated. Writes go
-- through the service role (the indexing worker); reads go through the permission-aware
-- retrieval function added in T-222, never straight from the tables (SECURITY §16).

create extension if not exists vector with schema extensions;

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('lesson', 'lesson_asset', 'document')),
  -- Scope: at most one of these; both null = platform-wide.
  course_version_id uuid references public.course_versions (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  -- The lesson this source (or its attachment) belongs to, for "open this lesson" links.
  lesson_id uuid references public.lessons (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error text check (error is null or char_length(error) <= 1000),
  -- Hash of the extracted text; an unchanged lesson is not re-embedded.
  content_hash text check (content_hash is null or char_length(content_hash) <= 128),
  chunk_count int not null default 0 check (chunk_count >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(course_version_id, organization_id) <= 1),
  -- Lesson sources are always tied to a course version and lesson.
  check (kind not in ('lesson', 'lesson_asset') or (course_version_id is not null and lesson_id is not null))
);
create unique index knowledge_sources_lesson_uniq on public.knowledge_sources (lesson_id) where kind = 'lesson';
create index knowledge_sources_version_idx on public.knowledge_sources (course_version_id);
create index knowledge_sources_org_idx on public.knowledge_sources (organization_id);
create index knowledge_sources_status_idx on public.knowledge_sources (status);

create trigger knowledge_sources_updated_at before update on public.knowledge_sources
  for each row execute function public.set_updated_at();

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  -- Scope copied from the source (filtering needs no join); kept equal to the source's by the indexer.
  course_version_id uuid references public.course_versions (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  position int not null check (position >= 0),
  content text not null check (char_length(content) between 1 and 8000),
  token_count int not null check (token_count > 0),
  content_hash text not null check (char_length(content_hash) <= 128),
  -- Optional (ADR-042): v1 searches the full-text column below; an embedding provider, when added,
  -- backfills these two together.
  embedding extensions.vector(1536),
  embedding_model text check (embedding_model is null or char_length(embedding_model) <= 100),
  fts tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  unique (source_id, position),
  check (num_nonnulls(course_version_id, organization_id) <= 1),
  check ((embedding is null) = (embedding_model is null))
);
create index knowledge_chunks_source_idx on public.knowledge_chunks (source_id);
create index knowledge_chunks_version_idx on public.knowledge_chunks (course_version_id);
create index knowledge_chunks_org_idx on public.knowledge_chunks (organization_id);
create index knowledge_chunks_fts_idx on public.knowledge_chunks using gin (fts);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.knowledge_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.knowledge_sources (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_jobs_claim_idx on public.knowledge_jobs (run_after) where status = 'queued';
create index knowledge_jobs_source_idx on public.knowledge_jobs (source_id);

create trigger knowledge_jobs_updated_at before update on public.knowledge_jobs
  for each row execute function public.set_updated_at();

alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_jobs enable row level security;

-- Deliberately no policies and no grants: only the service role touches these tables.
revoke all on public.knowledge_sources, public.knowledge_chunks, public.knowledge_jobs from anon, authenticated;
