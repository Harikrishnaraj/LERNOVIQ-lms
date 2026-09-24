-- T-080: learning paths (F-111): an ordered set of published courses a learner can follow.

create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger learning_paths_updated_at before update on public.learning_paths
  for each row execute function public.set_updated_at();

create table public.learning_path_courses (
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  position int not null check (position >= 0),
  primary key (path_id, course_id),
  unique (path_id, position)
);
create index learning_path_courses_course_idx on public.learning_path_courses (course_id);

create table public.path_enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  path_id uuid not null references public.learning_paths (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (user_id, path_id)
);
create index path_enrollments_path_idx on public.path_enrollments (path_id);

alter table public.learning_paths enable row level security;
alter table public.learning_path_courses enable row level security;
alter table public.path_enrollments enable row level security;

create policy "published paths are public" on public.learning_paths for select
  using (status = 'published' or public.has_permission('course.read_all'));
create policy "path courses follow the path" on public.learning_path_courses for select
  using (exists (select 1 from public.learning_paths p where p.id = path_id and (p.status = 'published' or public.has_permission('course.read_all'))));

create policy "read own path enrollments" on public.path_enrollments for select to authenticated
  using (user_id = auth.uid());
create policy "enroll self in a published path" on public.path_enrollments for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.learning_paths p where p.id = path_id and p.status = 'published')
  );
create policy "leave own path" on public.path_enrollments for delete to authenticated
  using (user_id = auth.uid());

revoke update on public.path_enrollments from anon, authenticated;

-- The catalog of published paths with course counts and the caller's own progress.
create function public.list_learning_paths()
returns table (
  path_id uuid,
  slug text,
  title text,
  description text,
  course_count int,
  completed_count int,
  enrolled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.slug, p.title, p.description,
         (select count(*)::int from public.learning_path_courses pc
            join public.courses c on c.id = pc.course_id and c.published_version_id is not null
           where pc.path_id = p.id),
         (select count(*)::int from public.learning_path_courses pc
            join public.courses c on c.id = pc.course_id and c.published_version_id is not null
            join public.enrollments e on e.course_id = c.id and e.user_id = auth.uid() and e.status = 'completed'
           where pc.path_id = p.id),
         exists (select 1 from public.path_enrollments pe where pe.path_id = p.id and pe.user_id = auth.uid())
    from public.learning_paths p
   where p.status = 'published'
   order by p.title;
$$;
revoke all on function public.list_learning_paths() from public, anon;
grant execute on function public.list_learning_paths() to authenticated;

-- One path with its published courses in order and the caller's status in each.
create function public.get_learning_path(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_path public.learning_paths;
begin
  select * into v_path from public.learning_paths where slug = p_slug and status = 'published';
  if not found then return null; end if;
  return jsonb_build_object(
    'id', v_path.id,
    'slug', v_path.slug,
    'title', v_path.title,
    'description', v_path.description,
    'enrolled', exists (select 1 from public.path_enrollments pe where pe.path_id = v_path.id and pe.user_id = auth.uid()),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'course_id', c.id,
        'slug', c.slug,
        'title', v.title,
        'level', v.level,
        'duration_minutes', v.duration_minutes,
        'price_cents', v.price_cents,
        'currency', v.currency,
        'position', pc.position,
        'status', coalesce(e.status, 'not_started')
      ) order by pc.position)
      from public.learning_path_courses pc
      join public.courses c on c.id = pc.course_id and c.published_version_id is not null
      join public.course_versions v on v.id = c.published_version_id
      left join public.enrollments e on e.course_id = c.id and e.user_id = auth.uid() and e.status <> 'cancelled'
     where pc.path_id = v_path.id
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_learning_path(text) from public, anon;
grant execute on function public.get_learning_path(text) to authenticated;
