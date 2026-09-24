-- T-040: certificates. Issued only by the server (service role) once the completion rule is met.
-- Identity fields are immutable (trigger); every issue/revoke is written to certificate_events
-- by a trigger, so the audit trail cannot be skipped by application code.

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  -- Public verification identifier, e.g. MLC-9F2A-1C4B-77D0-AB31. Unique and never changes.
  code text not null unique default (
    'MLC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 5, 4)) ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 9, 4)) ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 13, 4))
  ),
  enrollment_id uuid not null unique references public.enrollments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  version_id uuid not null references public.course_versions (id) on delete cascade,
  -- Snapshots: the certificate keeps saying what it said when issued.
  learner_name text not null check (char_length(learner_name) between 1 and 200),
  course_title text not null check (char_length(course_title) between 1 and 200),
  instructor_name text,
  issued_at timestamptz not null default now(),
  status text not null default 'issued' check (status in ('issued', 'revoked')),
  revoked_at timestamptz,
  revoked_reason text,
  revoked_by uuid references public.profiles (id)
);
create index certificates_user_idx on public.certificates (user_id, issued_at desc);

create table public.certificate_events (
  id bigint generated always as identity primary key,
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  event text not null check (event in ('issued', 'revoked')),
  actor_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index certificate_events_certificate_idx on public.certificate_events (certificate_id, created_at);

-- Immutability: only the revocation fields may ever change, and revocation is one-way.
create function public.certificates_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.enrollment_id is distinct from old.enrollment_id
     or new.user_id is distinct from old.user_id
     or new.course_id is distinct from old.course_id
     or new.version_id is distinct from old.version_id
     or new.learner_name is distinct from old.learner_name
     or new.course_title is distinct from old.course_title
     or new.instructor_name is distinct from old.instructor_name
     or new.issued_at is distinct from old.issued_at then
    raise exception 'certificate identity fields are immutable';
  end if;
  if old.status = 'revoked' and new.status is distinct from 'revoked' then
    raise exception 'a revoked certificate cannot be reinstated';
  end if;
  return new;
end;
$$;
create trigger certificates_guard before update on public.certificates
  for each row execute function public.certificates_guard();

-- No delete grant exists for API roles; deletion only happens through account/course erasure
-- cascades (service role), never from the client.

create function public.certificates_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.certificate_events (certificate_id, event, details)
    values (new.id, 'issued', jsonb_build_object('code', new.code, 'course_id', new.course_id));
  elsif new.status = 'revoked' and old.status <> 'revoked' then
    insert into public.certificate_events (certificate_id, event, actor_id, details)
    values (new.id, 'revoked', new.revoked_by, jsonb_build_object('reason', new.revoked_reason));
  end if;
  return new;
end;
$$;
create trigger certificates_audit after insert or update on public.certificates
  for each row execute function public.certificates_audit();

alter table public.certificates enable row level security;
alter table public.certificate_events enable row level security;

create policy "read own certificates" on public.certificates for select to authenticated
  using (
    user_id = auth.uid()
    or public.owns_course(course_id)
    or public.has_permission('course.read_all')
  );
create policy "staff read certificate events" on public.certificate_events for select to authenticated
  using (public.has_permission('course.read_all'));

revoke all on public.certificates, public.certificate_events from anon, authenticated;
grant select on public.certificates, public.certificate_events to authenticated;

-- Public verification: exactly what is printed on the certificate, nothing else (no ids,
-- no email). Looks up by the unguessable code only.
create function public.verify_certificate(p_code text)
returns table (
  code text,
  status text,
  learner_name text,
  course_title text,
  instructor_name text,
  issued_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.code, c.status, c.learner_name, c.course_title, c.instructor_name, c.issued_at, c.revoked_at
    from public.certificates c
   where c.code = upper(btrim(p_code));
$$;
grant execute on function public.verify_certificate(text) to anon, authenticated;
