import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLearnerAssessment } from "@/features/assessments/learner";
import {
  cleanup,
  createAssessment,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
  type CreatedAssessment,
} from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-107 / TEST_PLAN section 7: "Answer key is not leaked to learner API".
describe.skipIf(!hasLiveProject)("assessments schema + RLS (T-038, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("as");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let owner: { id: string; client: SupabaseClient };
  let otherInstructor: { id: string; client: SupabaseClient };
  let enrolled: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let reviewer: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let assessment: CreatedAssessment;
  let enrollmentId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    owner = await user("own", "instructor");
    otherInstructor = await user("oth", "instructor");
    enrolled = await user("enr", "learner");
    outsider = await user("out", "learner");
    reviewer = await user("rev", "content_reviewer");
    userIds.push(owner.id, otherInstructor.id, reviewer.id);
    learnerIds.push(enrolled.id, outsider.id);

    course = await createCourse(svc, owner.id, {
      slug: `${tag}-c`,
      title: `${tag} course`,
      publish: false,
    });
    courseIds.push(course.courseId);
    assessment = await createAssessment(svc, course.versionId, {
      title: `${tag} quiz`,
      passMark: 60,
      maxAttempts: 2,
      timeLimitMinutes: 15,
      questions: [
        {
          type: "mcq",
          prompt: "Pick the right one",
          points: 2,
          options: ["Wrong", "RIGHT-ANSWER", "Nope"],
          correct: [1],
          explanation: "SECRET-EXPLANATION",
        },
        { type: "short_answer", prompt: "Capital of France?", acceptedAnswers: ["SECRET-PARIS"] },
      ],
    });
    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: enrolled.id, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    enrollmentId = enr!.id;
    await svc.from("assessment_attempts").insert({
      assessment_id: assessment.assessmentId,
      enrollment_id: enrollmentId,
      user_id: enrolled.id,
      attempt_number: 1,
      answers: { q: "a" },
    });
  }, 90_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 60_000);

  describe("answer keys never reach learners", () => {
    it("returns the assessment content through the learner API without any key material", async () => {
      const result = await getLearnerAssessment(enrolled.client, assessment.assessmentId);
      expect(result).toMatchObject({ title: `${tag} quiz`, passMark: 60, maxAttempts: 2 });
      expect(result!.questions).toHaveLength(2);
      expect(result!.questions[0].options.map((o) => o.label)).toEqual(["Wrong", "RIGHT-ANSWER", "Nope"]);

      const json = JSON.stringify(result);
      for (const forbidden of [
        "SECRET-EXPLANATION",
        "SECRET-PARIS",
        "is_correct",
        "correct_option_ids",
        "correctOptionIds",
        "accepted_answers",
        "explanation",
      ]) {
        expect(json).not.toContain(forbidden);
      }
      // Option objects expose exactly id + label.
      expect(Object.keys(result!.questions[0].options[0]).sort()).toEqual(["id", "label"]);
    });

    it("cannot read the key table directly, by embedding, or by any select", async () => {
      const direct = await enrolled.client.from("assessment_answer_keys").select("*");
      expect(direct.data ?? []).toEqual([]);

      const embedded = await enrolled.client
        .from("assessment_questions")
        .select("id, assessment_answer_keys(*)")
        .eq("assessment_id", assessment.assessmentId);
      const flat = JSON.stringify(embedded.data);
      expect(flat).not.toContain("SECRET-PARIS");
      expect(flat).not.toContain("correct_option_ids\":[\"");

      const wildcard = await enrolled.client
        .from("assessment_questions")
        .select("*")
        .eq("assessment_id", assessment.assessmentId);
      expect(JSON.stringify(wildcard.data)).not.toMatch(/correct|accepted|explanation/i);
    });

    it("cannot write keys, questions or attempts", async () => {
      const q = assessment.questions[0].id;
      expect(
        (await enrolled.client.from("assessment_answer_keys").update({ explanation: "x" }).eq("question_id", q))
          .data ?? [],
      ).toEqual([]);
      const key = await svc.from("assessment_answer_keys").select("explanation").eq("question_id", q).single();
      expect(key.data?.explanation).toBe("SECRET-EXPLANATION");

      const insQ = await enrolled.client
        .from("assessment_questions")
        .insert({ assessment_id: assessment.assessmentId, prompt: "x", type: "essay" });
      expect(insQ.error).not.toBeNull();
      const insAttempt = await enrolled.client.from("assessment_attempts").insert({
        assessment_id: assessment.assessmentId,
        enrollment_id: enrollmentId,
        user_id: enrolled.id,
        attempt_number: 2,
        passed: true,
      });
      expect(insAttempt.error).not.toBeNull();
    });
  });

  describe("who can read assessment content", () => {
    it("hides it from a learner who is not enrolled", async () => {
      expect(await getLearnerAssessment(outsider.client, assessment.assessmentId)).toBeNull();
      const opts = await outsider.client.from("assessment_options").select("id");
      expect(opts.data).toEqual([]);
    });

    it("hides it from anonymous callers", async () => {
      const anon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      const { data, error } = await anon.from("assessments").select("id");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });

    it("hides it from an unrelated instructor", async () => {
      expect(await getLearnerAssessment(otherInstructor.client, assessment.assessmentId)).toBeNull();
    });

    it("gives the owning instructor and staff the answer keys", async () => {
      for (const who of [owner, reviewer]) {
        const keys = await who.client
          .from("assessment_answer_keys")
          .select("question_id, correct_option_ids, accepted_answers, explanation")
          .in(
            "question_id",
            assessment.questions.map((q) => q.id),
          );
        expect(keys.data).toHaveLength(2);
        expect(JSON.stringify(keys.data)).toContain("SECRET-PARIS");
      }
    });
  });

  describe("authoring rules", () => {
    it("lets the owner edit while the version is a draft, and blocks edits once submitted", async () => {
      const ok = await owner.client
        .from("assessments")
        .update({ title: `${tag} renamed` })
        .eq("id", assessment.assessmentId)
        .select("id");
      expect(ok.data).toHaveLength(1);

      await svc.from("course_versions").update({ status: "submitted" }).eq("id", course.versionId);
      const blocked = await owner.client
        .from("assessments")
        .update({ title: "sneaky" })
        .eq("id", assessment.assessmentId)
        .select("id");
      expect(blocked.data).toEqual([]);
      const keyEdit = await owner.client
        .from("assessment_answer_keys")
        .update({ accepted_answers: ["hacked"] })
        .eq("question_id", assessment.questions[1].id)
        .select("question_id");
      expect(keyEdit.data).toEqual([]);
      await svc.from("course_versions").update({ status: "draft" }).eq("id", course.versionId);
    });

    it("blocks another instructor from editing", async () => {
      const r = await otherInstructor.client
        .from("assessments")
        .update({ title: "hijack" })
        .eq("id", assessment.assessmentId)
        .select("id");
      expect(r.data ?? []).toEqual([]);
    });

    it("enforces value constraints (pass mark, attempts, points)", async () => {
      const bad = await svc
        .from("assessments")
        .insert({ version_id: course.versionId, title: "bad", pass_mark: 150 });
      expect(bad.error).not.toBeNull();
      const zeroAttempts = await svc
        .from("assessments")
        .insert({ version_id: course.versionId, title: "bad", max_attempts: 0 });
      expect(zeroAttempts.error).not.toBeNull();
      const badPoints = await svc.from("assessment_questions").insert({
        assessment_id: assessment.assessmentId,
        type: "mcq",
        prompt: "x",
        points: 0,
      });
      expect(badPoints.error).not.toBeNull();
    });
  });

  describe("attempts", () => {
    it("are visible to their learner and the owner, not to other learners", async () => {
      const mine = await enrolled.client.from("assessment_attempts").select("id");
      expect(mine.data).toHaveLength(1);
      const ownerView = await owner.client.from("assessment_attempts").select("id");
      expect(ownerView.data).toHaveLength(1);
      const other = await outsider.client.from("assessment_attempts").select("id");
      expect(other.data).toEqual([]);
    });
  });
});
