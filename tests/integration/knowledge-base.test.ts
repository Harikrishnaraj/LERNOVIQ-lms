import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { fakeVector } from "@/services/embeddings/fake";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

const toPg = (v: number[]) => `[${v.join(",")}]`;

// F-800 (T-220): knowledge base schema. Only the service role can touch these tables; retrieval
// reaches them through a permission-aware function (T-222), never directly.
describe.skipIf(!hasLiveProject)("knowledge base schema (T-220, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("kb");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let learner: { id: string; client: SupabaseClient };
  let admin: { id: string; client: SupabaseClient };
  let versionId: string;
  let lessonId: string;
  let sourceId: string;

  beforeAll(async () => {
    const mk = async (name: string, role: string) => {
      const u = await createUserWithRole(svc, `${tag}-${name}`, role);
      (role === "learner" ? learnerIds : userIds).push(u.id);
      const client = anon();
      const { error } = await client.auth.signInWithPassword({
        email: u.email,
        password: u.password,
      });
      if (error) throw error;
      return { id: u.id, client };
    };
    learner = await mk("lrn", "learner");
    admin = await mk("adm", "admin");
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
      sections: [
        {
          title: "Intro",
          lessons: [
            { title: "Closures", type: "text", content: "<p>Closures capture variables.</p>" },
          ],
        },
      ],
    });
    courseIds.push(course.courseId);
    versionId = course.versionId;
    lessonId = course.lessonIds[0];
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("stores a lesson source, a chunk with its embedding and a job via the service role", async () => {
    const { data: source, error } = await svc
      .from("knowledge_sources")
      .insert({
        kind: "lesson",
        course_version_id: versionId,
        lesson_id: lessonId,
        title: "Closures",
      })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(source!.status).toBe("pending");
    sourceId = source!.id;

    const chunk = await svc.from("knowledge_chunks").insert({
      source_id: sourceId,
      course_version_id: versionId,
      lesson_id: lessonId,
      position: 0,
      content: "Closures capture variables from their scope.",
      token_count: 8,
      content_hash: "h1",
      embedding: toPg(fakeVector("Closures capture variables from their scope.")),
      embedding_model: "fake-embed-1",
    });
    expect(chunk.error).toBeNull();

    const job = await svc.from("knowledge_jobs").insert({ source_id: sourceId });
    expect(job.error).toBeNull();
  });

  it("keeps the stored chunk and its embedding readable by the service role", async () => {
    const { data } = await svc
      .from("knowledge_chunks")
      .select("content, embedding_model, token_count")
      .eq("source_id", sourceId);
    expect(data).toEqual([
      {
        content: "Closures capture variables from their scope.",
        embedding_model: "fake-embed-1",
        token_count: 8,
      },
    ]);
  });

  it("rejects a vector of the wrong size", async () => {
    const { error } = await svc.from("knowledge_chunks").insert({
      source_id: sourceId,
      course_version_id: versionId,
      lesson_id: lessonId,
      position: 1,
      content: "x",
      token_count: 1,
      content_hash: "h2",
      embedding: "[1,2,3]",
      embedding_model: "fake-embed-1",
    });
    expect(error).not.toBeNull();
  });

  it("enforces scope rules: at most one scope, and lesson sources need a version and lesson", async () => {
    const { data: org } = await svc
      .from("organizations")
      .insert({ name: `${tag} org`, slug: `${tag}-org` })
      .select("id")
      .single();
    const both = await svc
      .from("knowledge_sources")
      .insert({
        kind: "document",
        course_version_id: versionId,
        organization_id: org!.id,
        title: "Both scopes",
      });
    expect(both.error).not.toBeNull();
    const bareLesson = await svc
      .from("knowledge_sources")
      .insert({ kind: "lesson", title: "No version or lesson" });
    expect(bareLesson.error).not.toBeNull();
    const orgDoc = await svc
      .from("knowledge_sources")
      .insert({ kind: "document", organization_id: org!.id, title: "Org doc" });
    expect(orgDoc.error).toBeNull();
    const platformDoc = await svc
      .from("knowledge_sources")
      .insert({ kind: "document", title: "Platform doc" });
    expect(platformDoc.error).toBeNull();
    await svc.from("knowledge_sources").delete().in("title", ["Org doc", "Platform doc"]);
    await svc.from("organizations").delete().eq("id", org!.id);
  });

  it("allows only one source per lesson", async () => {
    const dup = await svc
      .from("knowledge_sources")
      .insert({
        kind: "lesson",
        course_version_id: versionId,
        lesson_id: lessonId,
        title: "Closures again",
      });
    expect(dup.error).not.toBeNull();
  });

  it.each(["knowledge_sources", "knowledge_chunks", "knowledge_jobs"])(
    "hides %s from learners, admins and anonymous visitors",
    async (table) => {
      for (const client of [learner.client, admin.client, anon()]) {
        const { data } = await client.from(table).select("*");
        expect(data ?? []).toEqual([]);
      }
    },
  );

  it("gives clients no way to write", async () => {
    const forged = await learner.client
      .from("knowledge_sources")
      .insert({ kind: "document", title: "forged" });
    expect(forged.error).not.toBeNull();
    const chunk = await admin.client.from("knowledge_chunks").delete().eq("source_id", sourceId);
    expect(chunk.error).not.toBeNull();
  });

  it("removes a source's chunks and jobs when the source is deleted", async () => {
    await svc.from("knowledge_sources").delete().eq("id", sourceId);
    const { count: chunks } = await svc
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId);
    const { count: jobs } = await svc
      .from("knowledge_jobs")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId);
    expect(chunks).toBe(0);
    expect(jobs).toBe(0);
  });

  it("removes a lesson's knowledge when its course version is deleted", async () => {
    const { data: s } = await svc
      .from("knowledge_sources")
      .insert({
        kind: "lesson",
        course_version_id: versionId,
        lesson_id: lessonId,
        title: "Closures",
      })
      .select("id")
      .single();
    await svc.from("courses").delete().eq("id", courseIds[0]);
    courseIds.length = 0;
    const { data: after } = await svc.from("knowledge_sources").select("id").eq("id", s!.id);
    expect(after).toEqual([]);
  });
});
