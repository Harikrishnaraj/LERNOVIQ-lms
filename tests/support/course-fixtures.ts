import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Shared by integration (vitest) and E2E (playwright) tests. Talks to the live Supabase project
// through the service role and creates uniquely-tagged rows so tests never depend on seed data.

export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export const uniqueTag = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export interface FixtureUser {
  id: string;
  email: string;
  password: string;
}

export async function createUserWithRole(
  svc: SupabaseClient,
  tag: string,
  role: string,
  opts: { fullName?: string; onboarded?: boolean } = {},
): Promise<FixtureUser> {
  const email = `${tag}@example.com`;
  const password = "fixture-password-1";
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  if (opts.fullName) await svc.from("profiles").update({ full_name: opts.fullName }).eq("id", id);
  await svc.from("user_roles").delete().eq("user_id", id);
  await svc.from("user_roles").insert({ user_id: id, role_id: role });
  if (opts.onboarded ?? role === "learner") {
    await svc.from("learner_onboarding").insert({ user_id: id, interests: ["design"] });
  }
  return { id, email, password };
}

export interface FixtureLesson {
  title: string;
  type?: "video" | "text" | "quiz" | "assignment";
  minutes?: number;
  preview?: boolean;
  content?: string;
}

export interface FixtureCourse {
  slug: string;
  title: string;
  subtitle?: string;
  description?: string;
  level?: "beginner" | "intermediate" | "advanced" | "all_levels";
  language?: string;
  priceCents?: number;
  ratingAvg?: number;
  ratingCount?: number;
  categoryId?: string | null;
  outcomes?: string[];
  requirements?: string[];
  sections?: { title: string; lessons: FixtureLesson[] }[];
  publish?: boolean;
}

export interface CreatedCourse {
  courseId: string;
  versionId: string;
  slug: string;
  lessonIds: string[];
}

export async function createCourse(
  svc: SupabaseClient,
  instructorId: string,
  c: FixtureCourse,
): Promise<CreatedCourse> {
  const sections = c.sections ?? [{ title: "Intro", lessons: [{ title: "Welcome", minutes: 10 }] }];
  const minutes = sections.flatMap((s) => s.lessons).reduce((n, l) => n + (l.minutes ?? 0), 0);

  const { data: course, error } = await svc
    .from("courses")
    .insert({
      slug: c.slug,
      instructor_id: instructorId,
      category_id: c.categoryId ?? null,
      rating_avg: c.ratingAvg ?? 0,
      rating_count: c.ratingCount ?? 0,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: version, error: versionError } = await svc
    .from("course_versions")
    .insert({
      course_id: course.id,
      version_number: 1,
      title: c.title,
      subtitle: c.subtitle ?? null,
      description: c.description ?? "",
      level: c.level ?? "beginner",
      language: c.language ?? "en",
      price_cents: c.priceCents ?? 0,
      outcomes: c.outcomes ?? [],
      requirements: c.requirements ?? [],
      duration_minutes: minutes,
    })
    .select("id")
    .single();
  if (versionError) throw versionError;

  const lessonIds: string[] = [];
  for (const [si, s] of sections.entries()) {
    const { data: section } = await svc
      .from("course_sections")
      .insert({ version_id: version.id, title: s.title, position: si })
      .select("id")
      .single();
    const { data: lessons, error: lessonError } = await svc
      .from("lessons")
      .insert(
        s.lessons.map((l, li) => ({
          section_id: section!.id,
          title: l.title,
          type: l.type ?? "text",
          position: li,
          duration_minutes: l.minutes ?? 0,
          is_preview: l.preview ?? false,
          content: l.content ?? `<p>${l.title}</p>`,
        })),
      )
      .select("id, position");
    if (lessonError) throw lessonError;
    lessonIds.push(...lessons!.sort((a, b) => a.position - b.position).map((l) => l.id));
  }

  if (c.publish ?? true) {
    await svc
      .from("course_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", version.id);
    await svc.from("courses").update({ published_version_id: version.id }).eq("id", course.id);
  }
  return { courseId: course.id, versionId: version.id, slug: c.slug, lessonIds };
}

/** Deletes users first (enrollments cascade), then the courses, in FK-safe order. */
export async function cleanup(
  svc: SupabaseClient,
  opts: { learnerIds?: string[]; courseIds?: string[]; userIds?: string[] },
) {
  await Promise.all((opts.learnerIds ?? []).map((id) => svc.auth.admin.deleteUser(id)));
  if (opts.courseIds?.length) {
    // enrollments.course_id has no cascade
    await svc.from("enrollments").delete().in("course_id", opts.courseIds);
    await svc.from("courses").delete().in("id", opts.courseIds);
  }
  await Promise.all((opts.userIds ?? []).map((id) => svc.auth.admin.deleteUser(id)));
}
