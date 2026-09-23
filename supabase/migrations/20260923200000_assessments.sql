-- T-038: assessments (quizzes/exams). Answer keys live in their own table that learners have
-- no policy on, so no query shape (select *, joins, embedding) can return a key to a learner.
-- Attempt writes and grading run server-side with the service role (T-039).

-- Enrolled learners (exact version), the owning instructor and staff may read assessment content.
create function public.can_access_assessment_version(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_enrolled_in_version_course(p_version_id)
      or public.has_permission('course.read_all')
      or exists (
        select 1 from public.course_versions v
         where v.id = p_version_id and public.owns_course(v.course_id)
      );
$$;
grant execute on function public.can_access_assessment_version(uuid) to authenticated;

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.course_versions (id) on delete cascade,
  lesson_id uuid unique references public.lessons (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  pass_mark int not null default 70 check (pass_mark between 0 and 100),
  max_attempts int check (max_attempts is null or max_attempts > 0), -- null = unlimited
  time_limit_minutes int check (time_limit_minutes is null or time_limit_minutes > 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessments_version_idx on public.assessments (version_id, position);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  type text not null check (type in ('mcq', 'multi', 'true_false', 'short_answer', 'essay', 'coding')),
  prompt text not null check (char_length(prompt) between 1 and 5000),
  points int not null default 1 check (points > 0),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index assessment_questions_assessment_idx on public.assessment_questions (assessment_id, position);

create table public.assessment_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.assessment_questions (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 1000),
  position int not null default 0
);
create index assessment_options_question_idx on public.assessment_options (question_id, position);

-- The answer key. One row per question; only owners/staff can ever read it.
create table public.assessment_answer_keys (
  question_id uuid primary key references public.assessment_questions (id) on delete cascade,
  correct_option_ids uuid[] not null default '{}', -- mcq / multi / true_false
  accepted_answers text[] not null default '{}',   -- short_answer (case-insensitive match)
  explanation text not null default ''             -- shown to the learner only after grading
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number int not null check (attempt_number > 0),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'graded')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  answers jsonb not null default '{}'::jsonb, -- { "<question_id>": <answer> }
  score numeric(8, 2),
  max_score numeric(8, 2),
  percent numeric(5, 2),
  passed boolean,
  unique (assessment_id, enrollment_id, attempt_number)
);
create index assessment_attempts_user_idx on public.assessment_attempts (user_id, assessment_id);

create trigger assessments_updated_at before update on public.assessments
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- RLS

alter table public.assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_options enable row level security;
alter table public.assessment_answer_keys enable row level security;
alter table public.assessment_attempts enable row level security;

create policy "read assessments" on public.assessments for select to authenticated
  using (public.can_access_assessment_version(version_id));
create policy "edit assessments" on public.assessments for all to authenticated
  using (public.can_edit_version(version_id)) with check (public.can_edit_version(version_id));

create policy "read questions" on public.assessment_questions for select to authenticated
  using (exists (select 1 from public.assessments a
                  where a.id = assessment_id and public.can_access_assessment_version(a.version_id)));
create policy "edit questions" on public.assessment_questions for all to authenticated
  using (exists (select 1 from public.assessments a
                  where a.id = assessment_id and public.can_edit_version(a.version_id)))
  with check (exists (select 1 from public.assessments a
                  where a.id = assessment_id and public.can_edit_version(a.version_id)));

create policy "read options" on public.assessment_options for select to authenticated
  using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id
                  where q.id = question_id and public.can_access_assessment_version(a.version_id)));
create policy "edit options" on public.assessment_options for all to authenticated
  using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id
                  where q.id = question_id and public.can_edit_version(a.version_id)))
  with check (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id
                  where q.id = question_id and public.can_edit_version(a.version_id)));

-- Keys: the owning instructor (and staff) only. Learners match no policy: always zero rows.
create policy "read answer keys" on public.assessment_answer_keys for select to authenticated
  using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id
                  join public.course_versions v on v.id = a.version_id
                  where q.id = question_id
                    and (public.owns_course(v.course_id) or public.has_permission('course.read_all'))));
create policy "edit answer keys" on public.assessment_answer_keys for all to authenticated
  using (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id
                  where q.id = question_id and public.can_edit_version(a.version_id)))
  with check (exists (select 1 from public.assessment_questions q join public.assessments a on a.id = q.assessment_id
                  where q.id = question_id and public.can_edit_version(a.version_id)));

-- Attempts: a learner sees only their own; the course owner and staff can review. No client
-- writes at all: attempts are created, saved and graded server-side.
create policy "read attempts" on public.assessment_attempts for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('course.read_all')
    or exists (select 1 from public.assessments a join public.course_versions v on v.id = a.version_id
                where a.id = assessment_id and public.owns_course(v.course_id))
  );

-- ------------------------------------------------- privileges
revoke all on public.assessments, public.assessment_questions, public.assessment_options,
  public.assessment_answer_keys, public.assessment_attempts from anon, authenticated;
grant select on public.assessments, public.assessment_questions, public.assessment_options,
  public.assessment_answer_keys, public.assessment_attempts to authenticated;
grant insert, update, delete on public.assessments, public.assessment_questions,
  public.assessment_options, public.assessment_answer_keys to authenticated;
