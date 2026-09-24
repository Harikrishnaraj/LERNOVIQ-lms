import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCalendarEvents } from "@/features/calendar/events";
import { cleanup, createAssessment, createAssignment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-112: deadlines, submissions, assessments and certificates land on the right dates, per learner.
describe.skipIf(!hasLiveProject)("calendar events (T-082, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ce");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let learner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };

  async function user(name: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner");
    learnerIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    learner = await user("lrn");
    other = await user("oth");
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(ins.id);
    const c = await createCourse(svc, ins.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    courseIds.push(c.courseId);
    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId })
      .select("id")
      .single();

    const a = await createAssignment(svc, c.versionId, { title: "Report", dueAt: "2031-03-18T10:00:00Z" });
    await createAssignment(svc, c.versionId, { title: "No deadline" });
    await createAssignment(svc, c.versionId, { title: "Next month", dueAt: "2031-04-02T09:00:00Z" });
    await svc.from("assignment_submissions").insert({ assignment_id: a.assignmentId, user_id: learner.id, text_answer: "done", submitted_at: "2031-03-16T08:30:00Z" });

    const quiz = await createAssessment(svc, c.versionId, { title: "Quiz", questions: [] });
    await svc.from("assessment_attempts").insert([
      { assessment_id: quiz.assessmentId, enrollment_id: enrollment!.id, user_id: learner.id, attempt_number: 1, status: "submitted", submitted_at: "2031-03-17T12:00:00Z" },
      { assessment_id: quiz.assessmentId, enrollment_id: enrollment!.id, user_id: learner.id, attempt_number: 2, status: "in_progress" },
    ]);
    await svc.from("certificates").insert({
      enrollment_id: enrollment!.id, user_id: learner.id, course_id: c.courseId, version_id: c.versionId,
      learner_name: "Cal Learner", course_title: `${tag} Course`, issued_at: "2031-03-20T18:00:00Z",
    });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("returns each kind of event on its own day, sorted, inside the range only", async () => {
    const events = await getCalendarEvents(learner.client, learner.id, "2031-03-01", "2031-04-01");
    expect(events.map((e) => [e.at.slice(0, 10), e.kind, e.title])).toEqual([
      ["2031-03-16", "assignment_submitted", "Report"],
      ["2031-03-17", "assessment_taken", "Quiz"],
      ["2031-03-18", "assignment_due", "Report"],
      ["2031-03-20", "certificate", "Certificate earned"],
    ]);
    expect(events.every((e) => e.href.startsWith("/learner/"))).toBe(true);
    expect(events.find((e) => e.kind === "assessment_taken")!.href).toBe(`/learner/courses/${tag}-c/assessments/${events.find((e) => e.kind === "assessment_taken")!.href.split("/").pop()}`);
  });

  it("range end is exclusive and other months show their own events", async () => {
    expect(await getCalendarEvents(learner.client, learner.id, "2031-03-18", "2031-03-18")).toEqual([]);
    const day = await getCalendarEvents(learner.client, learner.id, "2031-03-18", "2031-03-19");
    expect(day.map((e) => e.kind)).toEqual(["assignment_due"]);
    const april = await getCalendarEvents(learner.client, learner.id, "2031-04-01", "2031-05-01");
    expect(april.map((e) => e.title)).toEqual(["Next month"]);
  });

  it("does not include in-progress attempts, undated assignments, or anything for other learners", async () => {
    const all = await getCalendarEvents(learner.client, learner.id, "2031-01-01", "2032-01-01");
    expect(all.map((e) => e.title)).not.toContain("No deadline");
    expect(all.filter((e) => e.kind === "assessment_taken")).toHaveLength(1);
    expect(await getCalendarEvents(other.client, other.id, "2031-01-01", "2032-01-01")).toEqual([]);
  });
});
