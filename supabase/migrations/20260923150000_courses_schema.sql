-- T-030: course catalog, versioned content, enrollments and lesson progress + RLS.
--
-- Model (ADR-010/011): workflow status lives on course_versions; a course points at
-- its live version through published_version_id. Content (sections/lessons) belongs to a
-- version, so editing never mutates what enrolled learners are reading.
--
-- Privileged columns (course_versions.status, courses.published_version_id, enrollments
-- writes beyond insert) are NOT grantable to `authenticated`; transitions run server-side
-- with the service role after an authorization check (RULES §4).

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Permission helper for RLS. security definer so it can read role tables regardless of caller.
create function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
     where ur.user_id = auth.uid() and rp.permission_id = p_permission
  );
$$;
grant execute on function public.has_permission(text) to anon, authenticated;

insert into public.permissions (id, description) values
  ('course.create', 'Create and edit own courses'),
  ('course.review', 'Review and decide on submitted courses'),
  ('course.read_all', 'Read every course regardless of status');
insert into public.role_permissions (role_id, permission_id) values
  ('instructor', 'course.create'),
  ('admin', 'course.create'),
  ('super_admin', 'course.create'),
  ('admin', 'course.review'),
  ('super_admin', 'course.review'),
  ('content_reviewer', 'course.review'),
  ('admin', 'course.read_all'),
  ('super_admin', 'course.read_all'),
  ('content_reviewer', 'course.read_all'),
  ('support_agent', 'course.read_all');

-- ---------------------------------------------------------------- tables

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  instructor_id uuid not null references public.profiles (id),
  category_id uuid references public.categories (id),
  published_version_id uuid, -- fk added below (circular)
  rating_avg numeric(3, 2) not null default 0,
  rating_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_instructor_idx on public.courses (instructor_id);
create index courses_category_idx on public.courses (category_id);

create table public.course_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  version_number int not null check (version_number > 0),
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'published', 'archived', 'rejected')
  ),
  title text not null check (char_length(title) between 1 and 200),
  subtitle text check (char_length(subtitle) <= 300),
  description text not null default '',
  level text not null default 'all_levels' check (level in ('beginner', 'intermediate', 'advanced', 'all_levels')),
  language text not null default 'en',
  thumbnail_url text,
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'USD',
  outcomes text[] not null default '{}',
  requirements text[] not null default '{}',
  certificate_enabled boolean not null default true,
  duration_minutes int not null default 0 check (duration_minutes >= 0),
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(description, ''))
  ) stored,
  unique (course_id, version_number)
);
create index course_versions_course_idx on public.course_versions (course_id);
create index course_versions_status_idx on public.course_versions (status);
create index course_versions_search_idx on public.course_versions using gin (search);

alter table public.courses
  add constraint courses_published_version_fk
  foreign key (published_version_id) references public.course_versions (id) on delete set null;

create table public.course_sections (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index course_sections_version_idx on public.course_sections (version_id, position);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.course_sections (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  type text not null default 'text' check (type in ('video', 'text', 'quiz', 'assignment')),
  position int not null default 0,
  content text not null default '', -- sanitized HTML only (RULES §6)
  video_url text,
  duration_minutes int not null default 0 check (duration_minutes >= 0),
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_section_idx on public.lessons (section_id, position);

create table public.lesson_assets (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index lesson_assets_lesson_idx on public.lesson_assets (lesson_id);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id),
  version_id uuid not null references public.course_versions (id),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, course_id)
);
create index enrollments_course_idx on public.enrollments (course_id);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  completed_at timestamptz,
  last_position_seconds int not null default 0 check (last_position_seconds >= 0),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, lesson_id)
);

create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger course_versions_updated_at before update on public.course_versions
  for each row execute function public.set_updated_at();
create trigger lessons_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();
create trigger lesson_progress_updated_at before update on public.lesson_progress
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------ access helpers
-- security definer + stable: evaluated once per statement, and avoids RLS recursion between
-- courses and course_versions policies.

create function public.owns_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c where c.id = p_course_id and c.instructor_id = auth.uid());
$$;

create function public.version_is_published(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.courses c where c.published_version_id = p_version_id);
$$;

-- The instructor may edit content only while the version is a draft or has changes requested.
create function public.can_edit_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.course_versions v
      join public.courses c on c.id = v.course_id
     where v.id = p_version_id
       and c.instructor_id = auth.uid()
       and v.status in ('draft', 'changes_requested')
  );
$$;

create function public.can_read_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.version_is_published(p_version_id)
      or public.has_permission('course.read_all')
      or exists (
        select 1 from public.course_versions v
         where v.id = p_version_id and public.owns_course(v.course_id)
      );
$$;

create function public.is_enrolled_in_version_course(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.course_versions v
      join public.enrollments e on e.course_id = v.course_id
     where v.id = p_version_id and e.user_id = auth.uid() and e.status <> 'cancelled'
  );
$$;

-- Lesson body/video is visible to: staff, the owning instructor, enrolled learners of a course,
-- or anyone for a preview lesson of a published version.
create function public.can_read_lesson(p_lesson_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.lessons l
      join public.course_sections s on s.id = l.section_id
     where l.id = p_lesson_id
       and (
         public.has_permission('course.read_all')
         or exists (select 1 from public.course_versions v where v.id = s.version_id and public.owns_course(v.course_id))
         or (public.version_is_published(s.version_id) and l.is_preview)
         or public.is_enrolled_in_version_course(s.version_id)
       )
  );
$$;

grant execute on function
  public.owns_course(uuid), public.version_is_published(uuid), public.can_edit_version(uuid),
  public.can_read_version(uuid), public.is_enrolled_in_version_course(uuid), public.can_read_lesson(uuid)
  to anon, authenticated;

-- ------------------------------------------------------------- RLS

alter table public.categories enable row level security;
alter table public.courses enable row level security;
alter table public.course_versions enable row level security;
alter table public.course_sections enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_assets enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;

create policy "anyone reads categories" on public.categories for select using (true);

-- courses: published ones are public; owners and staff see the rest.
create policy "read courses" on public.courses for select using (
  published_version_id is not null
  or instructor_id = auth.uid()
  or public.has_permission('course.read_all')
);
create policy "instructors create own courses" on public.courses for insert to authenticated
  with check (instructor_id = auth.uid() and public.has_permission('course.create'));
create policy "instructors update own courses" on public.courses for update to authenticated
  using (instructor_id = auth.uid()) with check (instructor_id = auth.uid());

create policy "read versions" on public.course_versions for select
  using (public.can_read_version(id));
create policy "instructors create draft versions" on public.course_versions for insert to authenticated
  with check (status = 'draft' and public.owns_course(course_id));
create policy "instructors edit editable versions" on public.course_versions for update to authenticated
  using (public.can_edit_version(id)) with check (public.owns_course(course_id));
create policy "instructors delete draft versions" on public.course_versions for delete to authenticated
  using (public.owns_course(course_id) and status = 'draft');

create policy "read sections" on public.course_sections for select
  using (public.can_read_version(version_id));
create policy "edit sections" on public.course_sections for all to authenticated
  using (public.can_edit_version(version_id)) with check (public.can_edit_version(version_id));

create policy "read lessons" on public.lessons for select using (public.can_read_lesson(id));
create policy "edit lessons" on public.lessons for all to authenticated
  using (exists (select 1 from public.course_sections s where s.id = section_id and public.can_edit_version(s.version_id)))
  with check (exists (select 1 from public.course_sections s where s.id = section_id and public.can_edit_version(s.version_id)));

create policy "read lesson assets" on public.lesson_assets for select using (public.can_read_lesson(lesson_id));
create policy "edit lesson assets" on public.lesson_assets for all to authenticated
  using (exists (
    select 1 from public.lessons l join public.course_sections s on s.id = l.section_id
     where l.id = lesson_id and public.can_edit_version(s.version_id)))
  with check (exists (
    select 1 from public.lessons l join public.course_sections s on s.id = l.section_id
     where l.id = lesson_id and public.can_edit_version(s.version_id)));

-- enrollments: own rows; self-enrolment only into a published free course's live version.
-- Paid enrolment, completion and cancellation run server-side (service role).
create policy "read own enrollments" on public.enrollments for select to authenticated using (
  user_id = auth.uid()
  or public.owns_course(course_id)
  or public.has_permission('course.read_all')
);
create policy "self-enroll in free published courses" on public.enrollments for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'active'
    and exists (
      select 1
        from public.courses c
        join public.course_versions v on v.id = c.published_version_id
       where c.id = course_id and v.id = version_id and v.price_cents = 0
    )
  );

create policy "own lesson progress" on public.lesson_progress for all to authenticated
  using (exists (select 1 from public.enrollments e where e.id = enrollment_id and e.user_id = auth.uid()))
  with check (
    exists (select 1 from public.enrollments e where e.id = enrollment_id and e.user_id = auth.uid())
    and public.can_read_lesson(lesson_id)
  );

-- ------------------------------------------------- column privileges
-- Default table grants are revoked from the API roles and re-granted narrowly.

revoke all on public.categories, public.courses, public.course_versions, public.course_sections,
  public.lessons, public.lesson_assets, public.enrollments, public.lesson_progress
  from anon, authenticated;

grant select on public.categories to anon, authenticated;
grant select on public.courses, public.course_versions, public.course_sections, public.lessons,
  public.lesson_assets to anon, authenticated;
grant select on public.enrollments, public.lesson_progress to authenticated;

grant insert (slug, instructor_id, category_id) on public.courses to authenticated;
grant update (category_id) on public.courses to authenticated; -- slug is fixed once created

grant insert (course_id, version_number, title, subtitle, description, level, language, thumbnail_url,
  price_cents, currency, outcomes, requirements, certificate_enabled)
  on public.course_versions to authenticated;
grant update (title, subtitle, description, level, language, thumbnail_url, price_cents, currency,
  outcomes, requirements, certificate_enabled) on public.course_versions to authenticated;
grant delete on public.course_versions to authenticated;

grant insert, update, delete on public.course_sections, public.lessons, public.lesson_assets to authenticated;
grant insert (user_id, course_id, version_id) on public.enrollments to authenticated;
grant insert, update, delete on public.lesson_progress to authenticated;

