import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getLibraryUsage,
  getLicenceStatusReport,
  getModuleUsage,
  getProductLibraryUsage,
  getProductModuleUsage,
} from "@/features/admin/usage-reports";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

const key = (n: number) => n.toString(16).padStart(64, "0");

// F-420: consolidated usage and product reports (T-276), live Supabase.
describe.skipIf(!hasLiveProject)("usage and product reports (T-276, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("usrep");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const clientIds: string[] = [];

  let admin: SupabaseClient;
  let learnerClient: SupabaseClient;
  let courseId: string;
  let lessonIds: string[];
  let activeLicenceId: string;
  let expiredLicenceId: string;
  let revokedLicenceId: string;

  async function signIn(email: string, password: string) {
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    const adminUser = await createUserWithRole(svc, `${tag}-admin`, "admin");
    userIds.push(adminUser.id);
    admin = await signIn(adminUser.email, adminUser.password);

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
      sections: [{ title: "S1", lessons: [{ title: "L1", minutes: 5 }, { title: "L2", minutes: 5 }] }],
    });
    courseId = course.courseId;
    lessonIds = course.lessonIds;
    courseIds.push(courseId);

    // Two learners enrolled; one finished L1, the other only opened it.
    const learnerA = await createUserWithRole(svc, `${tag}-la`, "learner");
    const learnerB = await createUserWithRole(svc, `${tag}-lb`, "learner");
    learnerIds.push(learnerA.id, learnerB.id);
    learnerClient = await signIn(learnerA.email, learnerA.password);
    for (const [i, learner] of [learnerA, learnerB].entries()) {
      const { data: enrollment, error } = await svc
        .from("enrollments")
        .insert({ user_id: learner.id, course_id: courseId, version_id: course.versionId })
        .select("id")
        .single();
      if (error) throw error;
      await svc.from("lesson_progress").insert({
        enrollment_id: enrollment.id,
        lesson_id: lessonIds[0],
        completed_at: i === 0 ? new Date().toISOString() : null,
      });
    }

    // One customer with three licences: active, expired and revoked, covering the same course.
    const { data: client } = await svc.from("content_clients").insert({ name: `${tag} Client` }).select("id").single();
    clientIds.push(client!.id);
    const past = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: licences, error: licenceError } = await svc
      .from("content_licences")
      .insert([
        { client_id: client!.id, name: `${tag}-active`, seat_limit: 5 },
        { client_id: client!.id, name: `${tag}-expired`, expires_at: past },
        { client_id: client!.id, name: `${tag}-revoked`, revoked_at: past },
      ])
      .select("id, name");
    if (licenceError) throw licenceError;
    activeLicenceId = licences!.find((l) => l.name.endsWith("active"))!.id;
    expiredLicenceId = licences!.find((l) => l.name.endsWith("expired"))!.id;
    revokedLicenceId = licences!.find((l) => l.name.endsWith("revoked"))!.id;
    await svc.from("content_licence_courses").insert([activeLicenceId, expiredLicenceId, revokedLicenceId].map((licence_id) => ({ licence_id, course_id: courseId })));
    const { data: dispatch } = await svc
      .from("content_dispatches")
      .insert({ licence_id: activeLicenceId, course_id: courseId })
      .select("id")
      .single();

    // Two learners launched the active licence's course: three launches in all.
    const { data: registrations, error: registrationError } = await svc
      .from("content_registrations")
      .insert([
        { dispatch_id: dispatch!.id, learner_key: key(1), launch_count: 2 },
        { dispatch_id: dispatch!.id, learner_key: key(2), launch_count: 1 },
      ])
      .select("id");
    if (registrationError) throw registrationError;
    await svc.from("content_launch_events").insert(
      [registrations![0], registrations![0], registrations![1]].map((r) => ({
        licence_id: activeLicenceId,
        dispatch_id: dispatch!.id,
        registration_id: r.id,
      })),
    );
  }, 200_000);

  afterAll(async () => {
    if (clientIds.length) await svc.from("content_clients").delete().in("id", clientIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("counts learners who accessed and completed a lesson", async () => {
    const rows = await getModuleUsage(admin, 30);
    const l1 = rows.find((r) => r.lessonId === lessonIds[0]);
    expect(l1).toMatchObject({ courseTitle: `${tag} Course`, sectionTitle: "S1", learnersAccessed: 2, learnersCompleted: 1 });
    expect(rows.some((r) => r.lessonId === lessonIds[1])).toBe(false);
  });

  it("lists every lesson of an enrolled course in the product module report, started or not", async () => {
    const rows = await getProductModuleUsage(admin);
    const mine = rows.filter((r) => r.courseId === courseId);
    expect(mine).toHaveLength(2);
    expect(mine.find((r) => r.lessonId === lessonIds[0])).toMatchObject({ learnersEnrolled: 2, learnersStarted: 2, learnersCompleted: 1 });
    expect(mine.find((r) => r.lessonId === lessonIds[1])).toMatchObject({ learnersEnrolled: 2, learnersStarted: 0, learnersCompleted: 0 });
  });

  it("totals library launches for today by licence and course", async () => {
    const rows = await getLibraryUsage(admin, 7);
    const mine = rows.filter((r) => r.clientName === `${tag} Client`);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ licenceName: `${tag}-active`, courseId, launches: 3, learners: 2 });
  });

  it("totals product library usage per licence and course", async () => {
    const rows = await getProductLibraryUsage(admin);
    const row = rows.find((r) => r.licenceName === `${tag}-active` && r.courseId === courseId);
    expect(row).toMatchObject({ registrations: 2, launches: 3 });
    expect(row!.firstLaunchAt).not.toBeNull();
  });

  it("reports licence status with seat use", async () => {
    const rows = (await getLicenceStatusReport(admin)).filter((r) => r.clientName === `${tag} Client`);
    const byId = new Map(rows.map((r) => [r.licenceId, r]));
    expect(byId.get(activeLicenceId)).toMatchObject({ status: "active", seatLimit: 5, seatsUsed: 2, courses: 1 });
    expect(byId.get(expiredLicenceId)?.status).toBe("expired");
    expect(byId.get(revokedLicenceId)?.status).toBe("revoked");
  });

  it("refuses all five reports to a learner without analytics.read", async () => {
    await expect(getModuleUsage(learnerClient, 30)).rejects.toThrow(/not allowed/);
    await expect(getProductModuleUsage(learnerClient)).rejects.toThrow(/not allowed/);
    await expect(getLibraryUsage(learnerClient, 30)).rejects.toThrow(/not allowed/);
    await expect(getProductLibraryUsage(learnerClient)).rejects.toThrow(/not allowed/);
    await expect(getLicenceStatusReport(learnerClient)).rejects.toThrow(/not allowed/);
  });
});
