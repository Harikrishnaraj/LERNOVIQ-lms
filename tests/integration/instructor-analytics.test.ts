import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getInstructorActiveLearners,
  getInstructorAssessmentAnalytics,
  getInstructorCourses,
  getInstructorCoursesBreakdown,
  getInstructorDailyAnalytics,
  getInstructorExportRows,
  getInstructorLessonAnalytics,
  getInstructorQuestionAnalytics,
  summarizeInstructorAnalytics,
} from "@/features/instructor/analytics";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-216: Instructor analytics (T-107, T-108, TEST_PLAN §12)
describe.skipIf(!hasLiveProject)("instructor analytics (T-107, T-108, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ina");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

  let teacherA: { id: string; client: SupabaseClient };
  let teacherB: { id: string; client: SupabaseClient };
  let courseA: Awaited<ReturnType<typeof createCourse>>;
  let courseB: Awaited<ReturnType<typeof createCourse>>;
  let courseA2: Awaited<ReturnType<typeof createCourse>>;
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    teacherA = await user("tcha", "instructor");
    teacherB = await user("tchb", "instructor");

    courseA = await createCourse(svc, teacherA.id, {
      slug: `${tag}-course-a`,
      title: `${tag} Analytics 101`,
      publish: true,
    });
    courseIds.push(courseA.courseId);

    // Update course version price
    await svc
      .from("course_versions")
      .update({ price_cents: 2500 })
      .eq("id", courseA.versionId);

    courseB = await createCourse(svc, teacherB.id, {
      slug: `${tag}-course-b`,
      title: `${tag} Teacher B Course`,
      publish: true,
    });
    courseIds.push(courseB.courseId);

    const l1 = await user("l1", "learner");
    const l2 = await user("l2", "learner");

    const l3 = await user("l3", "learner");
    const l4 = await user("l4", "learner");

    // Enrollments for teacherA's course
    const { data: e1 } = await svc
      .from("enrollments")
      .insert({
        user_id: l1.id,
        course_id: courseA.courseId,
        version_id: courseA.versionId,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    // l1 is active through tracked learning time only.
    await svc.from("lesson_time").insert({ enrollment_id: e1!.id, lesson_id: courseA.lessonIds[0], day: today, seconds: 600 });

    // l3 enrolled 60 days ago and completed today: outside a 7-day cohort, and not active.
    await svc.from("enrollments").insert({
      user_id: l3.id,
      course_id: courseA.courseId,
      version_id: courseA.versionId,
      status: "completed",
      enrolled_at: daysAgo(60),
      completed_at: new Date().toISOString(),
    });
    // l4 only enrolled today: counts as an enrollment, not as an active learner.
    await svc.from("enrollments").insert({
      user_id: l4.id,
      course_id: courseA.courseId,
      version_id: courseA.versionId,
      status: "active",
    });

    const { data: e2 } = await svc
      .from("enrollments")
      .insert({
        user_id: l2.id,
        course_id: courseA.courseId,
        version_id: courseA.versionId,
        status: "active",
      })
      .select("id")
      .single();

    // Lesson progress for active learner
    await svc.from("lesson_progress").insert({
      enrollment_id: e2!.id,
      lesson_id: courseA.lessonIds[0],
      completed_at: null,
      last_position_seconds: 45,
      updated_at: new Date().toISOString(),
    });

    // Assessment for courseA
    const { data: ast } = await svc
      .from("assessments")
      .insert({
        version_id: courseA.versionId,
        title: `${tag} Quiz 1`,
        pass_mark: 70,
      })
      .select("id")
      .single();

    const { data: question } = await svc
      .from("assessment_questions")
      .insert({
        assessment_id: ast!.id,
        type: "mcq",
        prompt: "What is 2 + 2?",
        points: 1,
      })
      .select("id")
      .single();
    const questionId = question!.id as string;
    const { data: options } = await svc
      .from("assessment_options")
      .insert([
        { question_id: questionId, label: "4", position: 0 },
        { question_id: questionId, label: "5", position: 1 },
      ])
      .select("id, position");
    const [right] = options!.sort((a, b) => a.position - b.position).map((o) => o.id as string);
    await svc.from("assessment_answer_keys").insert({ question_id: questionId, correct_option_ids: [right] });
    // A second question in the same quiz: difficulty is worked out per question.
    const { data: q2 } = await svc
      .from("assessment_questions")
      .insert({ assessment_id: ast!.id, type: "short_answer", prompt: "Capital of France?", points: 1, position: 1 })
      .select("id")
      .single();
    await svc.from("assessment_answer_keys").insert({ question_id: q2!.id, accepted_answers: ["Paris"] });

    await svc.from("assessment_attempts").insert({
      assessment_id: ast!.id,
      enrollment_id: e2!.id,
      user_id: l2.id,
      attempt_number: 1,
      status: "graded",
      percent: 85,
      score: 85,
      max_score: 100,
      passed: true,
      answers: { [questionId]: right, [q2!.id]: "Lyon" },
      started_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
    });
    // Four more learners (enrolled 40 days ago) answer both questions correctly; the first one's
    // attempt and lesson progress are 20 days old, outside a 7-day range.
    for (let i = 0; i < 4; i++) {
      const extra = await user(`q${i}`, "learner");
      const { data: en } = await svc
        .from("enrollments")
        .insert({ user_id: extra.id, course_id: courseA.courseId, version_id: courseA.versionId, status: "active", enrolled_at: daysAgo(40) })
        .select("id")
        .single();
      await svc.from("assessment_attempts").insert({
        assessment_id: ast!.id,
        enrollment_id: en!.id,
        user_id: extra.id,
        attempt_number: 1,
        status: "graded",
        percent: 50,
        score: 1,
        max_score: 2,
        passed: false,
        answers: { [questionId]: right, [q2!.id]: "paris " },
        started_at: i === 0 ? daysAgo(20) : new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      });
      if (i === 0) {
        await svc.from("lesson_progress").insert({
          enrollment_id: en!.id,
          lesson_id: courseA.lessonIds[0],
          last_position_seconds: 45,
          updated_at: daysAgo(20),
        });
      }
    }

    // A second course of teacherA's that l2 also studies: l2 must count once in the total.
    courseA2 = await createCourse(svc, teacherA.id, { slug: `${tag}-course-a2`, title: `${tag} Analytics 201`, publish: true });
    courseIds.push(courseA2.courseId);
    const { data: e2b } = await svc
      .from("enrollments")
      .insert({ user_id: l2.id, course_id: courseA2.courseId, version_id: courseA2.versionId, status: "active" })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert({ enrollment_id: e2b!.id, lesson_id: courseA2.lessonIds[0], last_position_seconds: 10 });

    // Publish a version 2 of course A. Existing learners stay on version 1.
    const { data: v2 } = await svc
      .from("course_versions")
      .insert({ course_id: courseA.courseId, version_number: 2, title: `${tag} Analytics 101`, status: "published", published_at: new Date().toISOString() })
      .select("id")
      .single();
    const { data: s2 } = await svc.from("course_sections").insert({ version_id: v2!.id, title: "Intro", position: 0 }).select("id").single();
    await svc.from("lessons").insert({ section_id: s2!.id, title: "Welcome v2", type: "text", position: 0, content: "<p>v2</p>" });
    await svc.from("courses").update({ published_version_id: v2!.id }).eq("id", courseA.courseId);
  }, 300_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("lists courses owned by the authenticated instructor", async () => {
    const courses = await getInstructorCourses(teacherA.client);
    expect(courses.some((c) => c.id === courseA.courseId)).toBe(true);
    expect(courses.some((c) => c.id === courseB.courseId)).toBe(false);
  });

  it("returns zero-filled daily points for date range with today's enrollments and completions", async () => {
    const points = await getInstructorDailyAnalytics(teacherA.client, 7);
    expect(points).toHaveLength(7);
    const today = points.at(-1)!;
    expect(today.day).toBe(new Date().toISOString().slice(0, 10));
    expect(today.enrollments).toBeGreaterThanOrEqual(2);
    expect(today.completions).toBeGreaterThanOrEqual(1);
    expect(today.activeLearners).toBeGreaterThanOrEqual(2);
    expect(today.revenueCents).toBeGreaterThanOrEqual(5000); // 2 * $25
  });

  it("filters daily analytics by course", async () => {
    const pointsA = await getInstructorDailyAnalytics(teacherA.client, 7, courseA.courseId);
    expect(pointsA).toHaveLength(7);
    const today = pointsA.at(-1)!;
    expect(today.enrollments).toBeGreaterThanOrEqual(2);
  });

  it("returns course breakdown scoped to instructor's courses", async () => {
    const breakdown = await getInstructorCoursesBreakdown(teacherA.client, 30);
    const item = breakdown.find((b) => b.courseId === courseA.courseId);
    expect(item).toBeDefined();
    expect(item!.enrollments).toBeGreaterThanOrEqual(2);
    expect(item!.completions).toBeGreaterThanOrEqual(1);
    expect(item!.completionRate).toBeLessThanOrEqual(100);
    expect(item!.activeLearners).toBeGreaterThanOrEqual(2);
    expect(item!.revenueCents).toBeGreaterThanOrEqual(5000);
  });

  it("uses a cohort completion rate and does not count bare enrollments as active (C36, C37)", async () => {
    const [item] = await getInstructorCoursesBreakdown(teacherA.client, 7, courseA.courseId);
    // New in 7 days: l1 (completed), l2, l4. l3 completed today but enrolled 60 days ago.
    expect(item).toMatchObject({ enrollments: 3, completions: 1, completionRate: 33 });
    // Active in 7 days: l1 (learning time), l2 (progress, attempt) and three quiz takers; not l3 or l4.
    expect(item.activeLearners).toBe(5);
  });

  it("counts each active learner once across courses (C6, C52)", async () => {
    const breakdown = await getInstructorCoursesBreakdown(teacherA.client, 7);
    const perCourseSum = breakdown.reduce((n, c) => n + c.activeLearners, 0);
    expect(perCourseSum).toBe(6); // l2 is active in both courses
    expect(await getInstructorActiveLearners(teacherA.client, 7)).toBe(5);
    expect(await getInstructorActiveLearners(teacherB.client, 7, courseA.courseId)).toBe(0);
  });

  it("does NOT return unauthorized course data for overview (TEST_PLAN §12)", async () => {
    // Teacher B queries Teacher A's course ID
    const points = await getInstructorDailyAnalytics(teacherB.client, 7, courseA.courseId);
    expect(points).toHaveLength(0);

    const breakdown = await getInstructorCoursesBreakdown(teacherB.client, 30, courseA.courseId);
    expect(breakdown).toHaveLength(0);
  });

  it("summarizes instructor totals accurately", async () => {
    const points = await getInstructorDailyAnalytics(teacherA.client, 7, courseA.courseId);
    const breakdown = await getInstructorCoursesBreakdown(teacherA.client, 7, courseA.courseId);
    const active = await getInstructorActiveLearners(teacherA.client, 7, courseA.courseId);
    const summary = summarizeInstructorAnalytics(points, breakdown, active);

    expect(summary.totalEnrollments).toBe(3);
    expect(summary.totalCompletions).toBe(1);
    expect(summary.completionRate).toBe(33);
    expect(summary.activeLearners).toBe(5);
    expect(summary.totalRevenueCents).toBeGreaterThanOrEqual(5000);
  });

  it("returns video/lesson analytics with starts, completions and watch time (T-108)", async () => {
    const lessons = await getInstructorLessonAnalytics(teacherA.client, 30, courseA.courseId);
    expect(lessons.length).toBeGreaterThan(0);
    // Learners are still on version 1 after version 2 was published (C7, C39).
    const first = lessons.find((l) => l.lessonId === courseA.lessonIds[0])!;
    expect(first.versionNumber).toBe(1);
    expect(first.courseTitle).toBe(`${tag} Analytics 101`);
    expect(first.starts).toBe(2);
    expect(first.avgWatchSeconds).toBeGreaterThanOrEqual(45);
    // The current version is listed too.
    expect(lessons.some((l) => l.versionNumber === 2 && l.lessonTitle === "Welcome v2")).toBe(true);
  });

  it("filters lesson activity by the selected range (C38, C51)", async () => {
    const week = await getInstructorLessonAnalytics(teacherA.client, 7, courseA.courseId);
    // The 20-day-old progress row is outside the last 7 days.
    expect(week.find((l) => l.lessonId === courseA.lessonIds[0])!.starts).toBe(1);
  });

  it("counts only learners idle on a lesson for 14 days as dropped off, not those still on it (report audit C44)", async () => {
    // 30 days: two starts, neither completed. The one touched today is still in progress; the one
    // last touched 20 days ago has dropped off.
    const month = await getInstructorLessonAnalytics(teacherA.client, 30, courseA.courseId);
    expect(month.find((l) => l.lessonId === courseA.lessonIds[0])).toMatchObject({ starts: 2, completions: 0, dropOffRate: 50 });
    // 7 days: starts only count the learner active this week, but drop-off still covers everyone
    // who ever started the lesson, so the 20-day-idle learner keeps it at 50%, not 0%.
    const week = await getInstructorLessonAnalytics(teacherA.client, 7, courseA.courseId);
    expect(week.find((l) => l.lessonId === courseA.lessonIds[0])).toMatchObject({ starts: 1, dropOffRate: 50 });
  });

  it("returns assessment analytics with pass rate and avg attempts (T-108)", async () => {
    const assessments = await getInstructorAssessmentAnalytics(teacherA.client, 7, courseA.courseId);
    expect(assessments.length).toBeGreaterThan(0);
    const quiz = assessments.find((a) => a.assessmentTitle === `${tag} Quiz 1`);
    expect(quiz).toBeDefined();
    expect(quiz!.versionNumber).toBe(1);
    // 4 graded attempts started in the last 7 days (the fifth is 20 days old), 1 passed.
    expect(quiz!.totalAttempts).toBe(4);
    expect(quiz!.passRate).toBe(25);

    const month = await getInstructorAssessmentAnalytics(teacherA.client, 30, courseA.courseId);
    expect(month.find((a) => a.assessmentTitle === `${tag} Quiz 1`)!.totalAttempts).toBe(5);
  });

  it("returns question difficulty analytics (T-108)", async () => {
    // 30 days: five answers each. Question 1 always right; question 2 right 4 of 5 times
    // ("paris " matches "Paris"), so each question gets its own rate (C35, C5).
    const questions = await getInstructorQuestionAnalytics(teacherA.client, 30, courseA.courseId);
    const q = questions.find((item) => item.prompt === "What is 2 + 2?");
    expect(q).toMatchObject({ totalAttempts: 5, passRate: 100, difficulty: "easy", versionNumber: 1 });
    const q2 = questions.find((item) => item.prompt === "Capital of France?");
    expect(q2).toMatchObject({ totalAttempts: 5, passRate: 80, difficulty: "easy" });

    // 7 days: four answers, below the minimum, so no rating.
    const week = await getInstructorQuestionAnalytics(teacherA.client, 7, courseA.courseId);
    expect(week.find((item) => item.prompt === "What is 2 + 2?")).toMatchObject({ totalAttempts: 4, difficulty: null });
  });

  it("rates a question nobody answered as not enough data, never easy", async () => {
    const { data: fresh } = await svc
      .from("assessments")
      .insert({ version_id: courseA.versionId, title: `${tag} Fresh Quiz`, pass_mark: 70 })
      .select("id")
      .single();
    await svc.from("assessment_questions").insert({ assessment_id: fresh!.id, type: "mcq", prompt: `${tag} unanswered`, points: 1 });
    const questions = await getInstructorQuestionAnalytics(teacherA.client, 30, courseA.courseId);
    expect(questions.find((item) => item.prompt === `${tag} unanswered`)).toMatchObject({
      totalAttempts: 0,
      passRate: null,
      difficulty: null,
    });
  });

  it("returns export rows for CSV and enforces permission scope (T-108, TEST_PLAN §12)", async () => {
    const rows = await getInstructorExportRows(teacherA.client, 30, courseA.courseId);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.courseTitle === `${tag} Analytics 101`)).toBe(true);

    // Unauthorized check: Teacher B cannot export Teacher A's course data
    const unauthorized = await getInstructorExportRows(teacherB.client, 30, courseA.courseId);
    expect(unauthorized).toHaveLength(0);
  });

  it("limits the export roster to the range and reports tracked time and distinct passes (C13, C54, C14)", async () => {
    // The learner whose only activity is 20 days old is in the 30-day roster, not the 7-day one.
    const week = await getInstructorExportRows(teacherA.client, 7, courseA.courseId);
    const month = await getInstructorExportRows(teacherA.client, 30, courseA.courseId);
    expect(month.length).toBe(week.length + 1);

    // l1: 600 tracked seconds = 10 minutes.
    expect(week.some((r) => r.status === "completed" && r.learningTimeMinutes === 10)).toBe(true);
    expect(month.every((r) => r.assessmentsPassed <= 1)).toBe(true);
  });

  it("counts only the current version's lessons in the export after a re-enrolment (report audit C8)", async () => {
    // A learner completes the v1 lesson, then is moved onto version 2 (one lesson, not started).
    const mover = await user("mover", "learner");
    const enrolledAt = daysAgo(3);
    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: mover.id, course_id: courseA.courseId, version_id: courseA.versionId, status: "active", enrolled_at: enrolledAt })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert({ enrollment_id: enr!.id, lesson_id: courseA.lessonIds[0], completed_at: new Date().toISOString() });
    const { data: v2 } = await svc.from("course_versions").select("id").eq("course_id", courseA.courseId).eq("version_number", 2).single();
    await svc.from("enrollments").update({ version_id: v2!.id }).eq("id", enr!.id);

    const rows = await getInstructorExportRows(teacherA.client, 30, courseA.courseId);
    const row = rows.find((r) => new Date(r.enrolledAt).getTime() === new Date(enrolledAt).getTime());
    expect(row).toMatchObject({ completedLessons: 0, totalLessons: 1, progressPercent: 0 });
  });

  it("rejects anonymous callers", async () => {
    await expect(getInstructorCourses(anon())).rejects.toThrow();
    await expect(getInstructorDailyAnalytics(anon(), 7)).rejects.toThrow();
    await expect(getInstructorCoursesBreakdown(anon(), 7)).rejects.toThrow();
    await expect(getInstructorLessonAnalytics(anon(), 7)).rejects.toThrow();
    await expect(getInstructorAssessmentAnalytics(anon(), 7)).rejects.toThrow();
    await expect(getInstructorExportRows(anon(), 7)).rejects.toThrow();
    await expect(getInstructorActiveLearners(anon(), 7)).rejects.toThrow();
  });
});
