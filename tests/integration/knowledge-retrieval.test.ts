import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";
import { searchKnowledge } from "@/features/knowledge/retrieval";
import type { EmbeddingProvider } from "@/services/embeddings";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

const keywordOnly: EmbeddingProvider = {
  name: "openai",
  model: "text-embedding-3-small",
  embed: async () => ({
    ok: false,
    provider: "openai",
    model: "m",
    reason: "not_configured",
    code: "missing_api_key",
  }),
};

// F-801 (T-222): retrieval returns only passages the caller may read - their enrolled course
// versions, their own courses, their organization's documents and platform documents - and
// never another organization's or an unenrolled course's chunks (ADR-017, SECURITY §16).
describe.skipIf(!hasLiveProject)("permission-aware retrieval (T-222, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("kbret");
  // A word no other test uses, so every search below only sees this test's passages.
  const word = tag;
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const orgIds: string[] = [];
  let platformSourceId: string;

  type U = { id: string; client: SupabaseClient };
  let learner: U, outsider: U, owner: U, admin: U;
  let courseA: Awaited<ReturnType<typeof createCourse>>;
  let courseB: Awaited<ReturnType<typeof createCourse>>;
  let draftVersionId: string;

  async function user(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (error) throw error;
    return { id: u.id, client };
  }

  async function document(
    title: string,
    organizationId: string | null,
    courseVersionId: string | null = null,
  ) {
    const { data: source, error } = await svc
      .from("knowledge_sources")
      .insert({
        kind: "document",
        title,
        organization_id: organizationId,
        course_version_id: courseVersionId,
        status: "ready",
      })
      .select("id")
      .single();
    if (error) throw error;
    const content = `${title}\n\n${word} alpha beta reference material.`;
    const { error: chunkError } = await svc.from("knowledge_chunks").insert({
      source_id: source.id,
      organization_id: organizationId,
      course_version_id: courseVersionId,
      position: 0,
      content,
      token_count: 10,
      content_hash: `${title}-hash`,
    });
    if (chunkError) throw chunkError;
    return source.id as string;
  }

  const titles = async (u: U, query: string, courseId?: string) => {
    const result = await searchKnowledge(u.client, query, { courseId, limit: 20 });
    if (!result.ok) throw new Error(result.error);
    return result.passages.map((p) => p.title).sort();
  };

  beforeAll(async () => {
    learner = await user("lrn", "learner");
    outsider = await user("out", "learner");
    owner = await user("own", "instructor");
    admin = await user("adm", "admin");

    courseA = await createCourse(svc, owner.id, {
      slug: `${tag}-a`,
      title: `${tag} Course A`,
      sections: [
        {
          title: "Unit",
          lessons: [
            {
              title: "A full match",
              content: `<p>${word} alpha beta gamma explained in full.</p>`,
            },
            { title: "A partial match", content: `<p>${word} alpha only.</p>` },
          ],
        },
      ],
    });
    courseB = await createCourse(svc, owner.id, {
      slug: `${tag}-b`,
      title: `${tag} Course B`,
      sections: [
        {
          title: "Unit",
          lessons: [{ title: "B lesson", content: `<p>${word} alpha beta in course B.</p>` }],
        },
      ],
    });
    courseIds.push(courseA.courseId, courseB.courseId);
    for (const v of [courseA.versionId, courseB.versionId]) {
      await runKnowledgeIngest({ db: svc, embedder: keywordOnly, versionId: v });
    }

    await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: courseA.courseId, version_id: courseA.versionId });

    const { data: orgs } = await svc
      .from("organizations")
      .insert([
        { name: `${tag} Org X`, slug: `${tag}-x` },
        { name: `${tag} Org Y`, slug: `${tag}-y` },
      ])
      .select("id, slug");
    const orgX = orgs!.find((o) => o.slug === `${tag}-x`)!.id;
    const orgY = orgs!.find((o) => o.slug === `${tag}-y`)!.id;
    orgIds.push(orgX, orgY);
    await svc.from("organization_members").insert([
      { organization_id: orgX, user_id: learner.id },
      { organization_id: orgY, user_id: outsider.id },
    ]);
    await document("Org X handbook", orgX);
    await document("Org Y handbook", orgY);
    platformSourceId = await document("Platform guide", null);

    // A newer, unpublished version of course A with its own passage.
    const { data: v2 } = await svc
      .from("course_versions")
      .insert({ course_id: courseA.courseId, version_number: 2, title: `${tag} Course A v2` })
      .select("id")
      .single();
    draftVersionId = v2!.id;
    await document("A v2 draft notes", null, draftVersionId);
  }, 300_000);

  afterAll(async () => {
    await svc.from("knowledge_sources").delete().eq("id", platformSourceId);
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("gives an enrolled learner their course, their organization's documents and platform documents only", async () => {
    expect(await titles(learner, `${word} alpha`)).toEqual([
      "A full match",
      "A partial match",
      "Org X handbook",
      "Platform guide",
    ]);
  });

  it("never returns another organization's documents or an unenrolled course", async () => {
    const found = await titles(learner, `${word} alpha beta`);
    expect(found).not.toContain("Org Y handbook");
    expect(found).not.toContain("B lesson");
  });

  it("never returns another version of the course than the one the learner is enrolled in", async () => {
    expect(await titles(learner, `${word} reference`)).not.toContain("A v2 draft notes");
  });

  it("scopes the outsider to their own organization and platform documents", async () => {
    expect(await titles(outsider, `${word} alpha`)).toEqual(["Org Y handbook", "Platform guide"]);
  });

  it("narrows course content to the requested course and keeps documents eligible", async () => {
    expect(await titles(learner, `${word} alpha`, courseB.courseId)).toEqual([
      "Org X handbook",
      "Platform guide",
    ]);
    expect(await titles(learner, `${word} alpha`, courseA.courseId)).toEqual([
      "A full match",
      "A partial match",
      "Org X handbook",
      "Platform guide",
    ]);
  });

  it("lets the course owner search every version of their own courses", async () => {
    const found = await titles(owner, `${word} alpha`);
    expect(found).toEqual(
      expect.arrayContaining(["A full match", "A partial match", "B lesson", "A v2 draft notes"]),
    );
    expect(found).not.toContain("Org X handbook");
  });

  it("lets an admin with course.read_all search all course content", async () => {
    const found = await titles(admin, `${word} alpha`);
    expect(found).toEqual(expect.arrayContaining(["A full match", "B lesson", "Platform guide"]));
    expect(found).not.toContain("Org Y handbook");
  });

  it("ranks passages matching every word above partial matches", async () => {
    const result = await searchKnowledge(learner.client, `${word} alpha beta gamma`, {
      courseId: courseA.courseId,
    });
    expect(result.ok && result.passages[0].title).toBe("A full match");
  });

  it("returns nothing for a question with only stop words", async () => {
    expect(await titles(learner, "the and of")).toEqual([]);
  });

  it("respects the result limit", async () => {
    const result = await searchKnowledge(learner.client, `${word} alpha`, { limit: 2 });
    expect(result.ok && result.passages).toHaveLength(2);
  });

  it("stops returning a course once the enrollment is cancelled", async () => {
    await svc
      .from("enrollments")
      .update({ status: "cancelled" })
      .eq("user_id", learner.id)
      .eq("course_id", courseA.courseId);
    expect(await titles(learner, `${word} alpha`)).toEqual(["Org X handbook", "Platform guide"]);
    await svc
      .from("enrollments")
      .update({ status: "active" })
      .eq("user_id", learner.id)
      .eq("course_id", courseA.courseId);
  });

  it("stops returning a source's passages once the source is deleted", async () => {
    const { data } = await svc
      .from("knowledge_sources")
      .select("id")
      .eq("course_version_id", courseA.versionId)
      .eq("title", "A partial match")
      .single();
    await svc.from("knowledge_sources").delete().eq("id", data!.id);
    expect(await titles(learner, `${word} alpha`)).not.toContain("A partial match");
  });

  it("refuses anonymous callers", async () => {
    const { error } = await anon().rpc("match_knowledge_chunks", { p_query: `${word} alpha` });
    expect(error).not.toBeNull();
  });
});
