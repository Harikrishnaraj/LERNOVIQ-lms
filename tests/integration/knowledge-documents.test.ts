import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { bytes, makeBlankPdf, makeDocx, makePdf } from "../support/documents";
import { DOCUMENT_MIME, type DocumentFormat } from "@/features/knowledge/document-rules";
import { NO_TEXT_MESSAGE } from "@/features/knowledge/extract";
import { processJob, runKnowledgeIngest } from "@/features/knowledge/ingest";
import { searchKnowledge } from "@/features/knowledge/retrieval";
import {
  getKnowledgeStatusCounts,
  listKnowledgeSources,
  testKnowledgeRetrieval,
} from "@/features/knowledge/admin";
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

const BUCKET = "knowledge-documents";

// F-800 / F-801 / F-802 (T-221, T-223, T-225; TEST_PLAN §17): uploaded documents go from
// pending to ready (or a readable failure), their chunks stay tied to their source, another
// organization never retrieves them, deleting a source removes it from retrieval, re-indexing
// replaces the chunks, and only admins with knowledge.manage reach the admin functions.
describe.skipIf(!hasLiveProject)("knowledge documents (T-221/T-223/T-225, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("kbdoc");
  // A word no other test uses, so searches only see this test's passages.
  const word = tag;
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const orgIds: string[] = [];
  const sourceIds: string[] = [];
  const objectPaths: string[] = [];

  type U = { id: string; client: SupabaseClient };
  let admin: U, member: U, outsider: U, instructor: U;
  let orgX: string, orgY: string;

  async function signIn(name: string, role: string): Promise<U> {
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

  /** What the upload server actions do: put the file in the private bucket, create the source and job. */
  async function upload(
    fileName: string,
    format: DocumentFormat,
    content: Uint8Array,
    organizationId: string | null = null,
    title = fileName,
  ): Promise<string> {
    const path = `${organizationId ?? "platform"}/${randomUUID()}.${format}`;
    const { error: storageError } = await svc.storage
      .from(BUCKET)
      .upload(path, content, { contentType: DOCUMENT_MIME[format] });
    if (storageError) throw storageError;
    objectPaths.push(path);
    const { data, error } = await svc.rpc("create_document_source", {
      p_title: title,
      p_organization_id: organizationId,
      p_storage_path: path,
      p_mime_type: DOCUMENT_MIME[format],
      p_byte_size: content.byteLength,
      p_file_name: fileName,
      p_created_by: admin.id,
    });
    if (error) throw error;
    sourceIds.push(data as string);
    return data as string;
  }

  const index = (sourceId: string) =>
    runKnowledgeIngest({ db: svc, embedder: keywordOnly, sourceId });

  async function source(id: string) {
    const { data, error } = await svc.from("knowledge_sources").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }

  const chunks = async (id: string) =>
    (await svc.from("knowledge_chunks").select("*").eq("source_id", id).order("position")).data ??
    [];

  const learnerTitles = async (u: U, query: string) => {
    const result = await searchKnowledge(u.client, query, { limit: 20 });
    if (!result.ok) throw new Error(result.error);
    return result.passages.map((p) => p.title).sort();
  };

  beforeAll(async () => {
    admin = await signIn("adm", "admin");
    member = await signIn("mem", "learner");
    outsider = await signIn("out", "learner");
    instructor = await signIn("ins", "instructor");

    const { data: orgs, error } = await svc
      .from("organizations")
      .insert([
        { name: `${tag} Org X`, slug: `${tag}-x` },
        { name: `${tag} Org Y`, slug: `${tag}-y` },
      ])
      .select("id, slug");
    if (error) throw error;
    orgX = orgs!.find((o) => o.slug === `${tag}-x`)!.id;
    orgY = orgs!.find((o) => o.slug === `${tag}-y`)!.id;
    orgIds.push(orgX, orgY);
    await svc.from("organization_members").insert([
      { organization_id: orgX, user_id: member.id },
      { organization_id: orgY, user_id: outsider.id },
    ]);
  }, 300_000);

  afterAll(async () => {
    if (objectPaths.length) await svc.storage.from(BUCKET).remove(objectPaths);
    if (sourceIds.length) await svc.from("knowledge_sources").delete().in("id", sourceIds);
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  describe("storage and permission setup", () => {
    it("has a private bucket limited to 10 MB and the four document types", async () => {
      const { data, error } = await svc.storage.getBucket(BUCKET);
      expect(error).toBeNull();
      expect(data?.public).toBe(false);
      expect(data?.file_size_limit).toBe(10 * 1024 * 1024);
      expect(data?.allowed_mime_types?.slice().sort()).toEqual(Object.values(DOCUMENT_MIME).sort());

      const html = await svc.storage
        .from(BUCKET)
        .upload(`platform/${randomUUID()}.html`, bytes("<p>x</p>"), { contentType: "text/html" });
      expect(html.error).not.toBeNull();
    });

    it("grants knowledge.manage to admin and super_admin only", async () => {
      const { data } = await svc
        .from("role_permissions")
        .select("role_id")
        .eq("permission_id", "knowledge.manage");
      expect((data ?? []).map((r) => r.role_id).sort()).toEqual(["admin", "super_admin"]);
    });

    it("gives clients no access to the knowledge tables or the private bucket", async () => {
      for (const u of [admin, member]) {
        for (const table of ["knowledge_sources", "knowledge_chunks", "knowledge_jobs"]) {
          const { error } = await u.client.from(table).select("id").limit(1);
          expect(error, `${table} must not be readable by a client`).not.toBeNull();
        }
        const { data } = await u.client.storage.from(BUCKET).list("platform");
        expect(data ?? []).toEqual([]);
      }
    });
  });

  describe("upload to ready", () => {
    it("queues a document as pending, then indexes it to ready with chunks tied to its source", async () => {
      const id = await upload(
        "refunds.txt",
        "txt",
        bytes(`Refund rules\n\n${word} refunds are paid back within five working days.`),
        orgX,
        `${tag} Refund policy`,
      );

      const pending = await source(id);
      expect(pending).toMatchObject({
        kind: "document",
        status: "pending",
        organization_id: orgX,
        course_version_id: null,
        mime_type: "text/plain",
        file_name: "refunds.txt",
        chunk_count: 0,
        error: null,
      });
      const { data: jobs } = await svc.from("knowledge_jobs").select("status").eq("source_id", id);
      expect(jobs).toEqual([{ status: "queued" }]);

      // A worker claims it: processing, then complete.
      const { data: claimed } = await svc.rpc("claim_knowledge_jobs", {
        p_limit: 5,
        p_source_id: id,
      });
      expect(claimed).toHaveLength(1);
      expect((await source(id)).status).toBe("processing");
      expect(await processJob(svc, keywordOnly, claimed![0])).toBe("succeeded");

      const ready = await source(id);
      expect(ready).toMatchObject({ status: "ready", error: null });
      expect(ready.chunk_count).toBeGreaterThan(0);
      expect(ready.content_hash).toBeTruthy();

      const rows = await chunks(id);
      expect(rows).toHaveLength(ready.chunk_count);
      for (const row of rows) {
        expect(row.source_id).toBe(id);
        expect(row.organization_id).toBe(orgX);
        expect(row.course_version_id).toBeNull();
        expect(row.content).toContain(`${tag} Refund policy`);
      }
      expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i));
      expect(rows.map((r) => r.content).join("\n")).toContain("five working days");
    });

    it("indexes PDF, DOCX and Markdown documents and finds each by its own words", async () => {
      const pdf = await upload(
        "policy.pdf",
        "pdf",
        makePdf([[`${tag}pdf leave policy`, "Employees get 25 days off."]]),
        null,
        `${tag} PDF policy`,
      );
      const docx = await upload(
        "handbook.docx",
        "docx",
        await makeDocx([`${tag}docx security handbook`, "Use a password manager."]),
        null,
        `${tag} DOCX handbook`,
      );
      const md = await upload(
        "guide.md",
        "md",
        bytes(`# ${tag}md guide\n\nRead the **handbook** first.`),
        null,
        `${tag} MD guide`,
      );
      for (const id of [pdf, docx, md]) {
        expect(await index(id)).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
        expect(await source(id)).toMatchObject({ status: "ready", error: null });
        expect((await chunks(id)).length).toBeGreaterThan(0);
      }

      const found = await testKnowledgeRetrieval(admin.client, `${tag}pdf ${tag}docx ${tag}md`);
      expect(found.ok && found.data.map((p) => p.title).sort()).toEqual([
        `${tag} DOCX handbook`,
        `${tag} MD guide`,
        `${tag} PDF policy`,
      ]);
    });
  });

  describe("failed documents", () => {
    it.each([
      ["a corrupt PDF", "pdf", () => bytes("%PDF-1.4 not really a pdf"), /could not be read/i],
      ["a PDF with no text", "pdf", () => makeBlankPdf(), NO_TEXT_MESSAGE],
      ["a corrupt DOCX", "docx", () => bytes("PK\x03\x04 broken"), /could not be read/i],
      ["an empty text file", "txt", () => bytes("   \n  "), NO_TEXT_MESSAGE],
    ] as const)(
      "ends %s as failed with a readable error, at once",
      async (_label, format, make, message) => {
        const id = await upload(
          `broken.${format}`,
          format,
          make(),
          null,
          `${tag} broken ${_label}`,
        );
        expect(await index(id)).toMatchObject({ processed: 1, failed: 1, succeeded: 0 });

        const failed = await source(id);
        expect(failed.status).toBe("failed");
        expect(failed.error).toMatch(message);
        expect(failed.chunk_count).toBe(0);
        expect(await chunks(id)).toEqual([]);
        const { data: jobs } = await svc
          .from("knowledge_jobs")
          .select("status, attempts")
          .eq("source_id", id);
        expect(jobs).toEqual([{ status: "failed", attempts: 1 }]);
      },
    );

    it("shows failed documents, with their error, in the admin list's failed view", async () => {
      const result = await listKnowledgeSources(admin.client, {
        status: "failed",
        kind: "document",
        q: `${tag} broken`,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.total).toBe(4);
      expect(result.data.sources.every((s) => s.status === "failed" && s.error)).toBe(true);
      expect(result.data.sources.map((s) => s.fileName).sort()).toEqual([
        "broken.docx",
        "broken.pdf",
        "broken.pdf",
        "broken.txt",
      ]);
    });
  });

  describe("permission-aware retrieval of documents", () => {
    let orgDoc: string;
    let platformDoc: string;

    beforeAll(async () => {
      orgDoc = await upload(
        "x.txt",
        "txt",
        bytes(`${word}iso is for organization X only.`),
        orgX,
        `${tag} X only`,
      );
      const otherOrgDoc = await upload(
        "y.txt",
        "txt",
        bytes(`${word}iso is for organization Y only.`),
        orgY,
        `${tag} Y only`,
      );
      platformDoc = await upload(
        "p.txt",
        "txt",
        bytes(`${word}iso is for everybody.`),
        null,
        `${tag} For all`,
      );
      for (const id of [orgDoc, otherOrgDoc, platformDoc]) await index(id);
    });

    it("lets a member read their organization's document and platform documents, nothing from another organization", async () => {
      expect(await learnerTitles(member, `${word}iso`)).toEqual([
        `${tag} For all`,
        `${tag} X only`,
      ]);
      expect(await learnerTitles(outsider, `${word}iso`)).toEqual([
        `${tag} For all`,
        `${tag} Y only`,
      ]);
    });

    it("shows a user with no organization only platform documents", async () => {
      expect(await learnerTitles(instructor, `${word}iso`)).toEqual([`${tag} For all`]);
    });

    it("lets an admin test any organization only through the permission-checked admin function", async () => {
      // The learner-facing function stays scoped even for an admin who is in neither organization...
      expect(await learnerTitles(admin, `${word}iso`)).toEqual([`${tag} For all`]);
      // ...while test retrieval sees every organization, and can be narrowed to one.
      const all = await testKnowledgeRetrieval(admin.client, `${word}iso`);
      expect(all.ok && all.data.map((p) => p.title).sort()).toEqual([
        `${tag} For all`,
        `${tag} X only`,
        `${tag} Y only`,
      ]);
      const onlyY = await testKnowledgeRetrieval(admin.client, `${word}iso`, {
        organizationId: orgY,
      });
      expect(onlyY.ok && onlyY.data.map((p) => p.title).sort()).toEqual([
        `${tag} For all`,
        `${tag} Y only`,
      ]);
    });

    it("stops returning a source once it is deleted, along with its chunks and jobs", async () => {
      expect((await chunks(orgDoc)).length).toBeGreaterThan(0);
      const { error } = await svc.from("knowledge_sources").delete().eq("id", orgDoc);
      expect(error).toBeNull();
      expect(await chunks(orgDoc)).toEqual([]);
      const { data: jobs } = await svc.from("knowledge_jobs").select("id").eq("source_id", orgDoc);
      expect(jobs).toEqual([]);

      expect(await learnerTitles(member, `${word}iso`)).toEqual([`${tag} For all`]);
      const test = await testKnowledgeRetrieval(admin.client, `${word}iso`);
      expect(test.ok && test.data.map((p) => p.title)).not.toContain(`${tag} X only`);
    });

    it("includes uploaded documents in course-scoped searches only as documents, and ignores the course filter for them", async () => {
      const course = await createCourse(svc, instructor.id, {
        slug: `${tag}-course`,
        title: `${tag} Course`,
        sections: [
          {
            title: "Unit",
            lessons: [{ title: `${tag} Lesson A`, content: `<p>${word}iso is in a lesson.</p>` }],
          },
        ],
      });
      courseIds.push(course.courseId);
      await runKnowledgeIngest({ db: svc, embedder: keywordOnly, versionId: course.versionId });

      const narrowed = await testKnowledgeRetrieval(admin.client, `${word}iso`, {
        courseId: course.courseId,
      });
      expect(narrowed.ok && narrowed.data.map((p) => p.title).sort()).toEqual([
        `${tag} For all`,
        `${tag} Y only`,
        "Lesson",
      ]);
    });
  });

  describe("re-indexing", () => {
    it("replaces a document's chunks and a failed document can be re-indexed after its file is fixed", async () => {
      const id = await upload(
        "r.txt",
        "txt",
        bytes(`${word}reindex original text.`),
        null,
        `${tag} Reindex`,
      );
      await index(id);
      const before = await chunks(id);
      expect(before.length).toBeGreaterThan(0);

      // Without a requeue nothing is claimed: the job already succeeded.
      expect(await index(id)).toMatchObject({ processed: 0 });

      const { data: queued } = await svc.rpc("requeue_knowledge_source", { p_source_id: id });
      expect(queued).toBe("queued");
      expect(await source(id)).toMatchObject({
        status: "pending",
        content_hash: null,
        error: null,
      });
      const { data: jobs } = await svc
        .from("knowledge_jobs")
        .select("status")
        .eq("source_id", id)
        .eq("status", "queued");
      expect(jobs).toHaveLength(1);

      expect(await index(id)).toMatchObject({ processed: 1, succeeded: 1, unchanged: 0 });
      const after = await chunks(id);
      expect(after.length).toBe(before.length);
      expect(after.map((c) => c.id)).not.toEqual(before.map((c) => c.id)); // rewritten, not kept
      expect(await source(id)).toMatchObject({ status: "ready", chunk_count: after.length });
    });

    it("recovers a failed document once the stored file is replaced", async () => {
      const id = await upload("bad.pdf", "pdf", bytes("%PDF-1.4 junk"), null, `${tag} Recoverable`);
      await index(id);
      expect((await source(id)).status).toBe("failed");

      const { data: row } = await svc
        .from("knowledge_sources")
        .select("storage_path")
        .eq("id", id)
        .single();
      const { error } = await svc.storage
        .from(BUCKET)
        .upload(row!.storage_path, makePdf([[`${word}recovered text`]]), {
          contentType: "application/pdf",
          upsert: true,
        });
      expect(error).toBeNull();

      expect(await svc.rpc("requeue_knowledge_source", { p_source_id: id })).toMatchObject({
        data: "queued",
      });
      expect(await index(id)).toMatchObject({ succeeded: 1 });
      expect(await source(id)).toMatchObject({ status: "ready", error: null });
      const found = await testKnowledgeRetrieval(admin.client, `${word}recovered`);
      expect(found.ok && found.data.map((p) => p.title)).toEqual([`${tag} Recoverable`]);
    });

    it("re-indexes a lesson source and reports 'running' and 'not_found' correctly", async () => {
      const course = await createCourse(svc, instructor.id, {
        slug: `${tag}-re`,
        title: `${tag} Reindex course`,
        sections: [
          { title: "Unit", lessons: [{ title: "Lesson", content: `<p>${word}lesson text.</p>` }] },
        ],
      });
      courseIds.push(course.courseId);
      await runKnowledgeIngest({ db: svc, embedder: keywordOnly, versionId: course.versionId });
      const { data: lessonSource } = await svc
        .from("knowledge_sources")
        .select("id")
        .eq("lesson_id", course.lessonIds[0])
        .single();
      const lessonId = lessonSource!.id as string;
      expect((await source(lessonId)).status).toBe("ready");

      expect(await svc.rpc("requeue_knowledge_source", { p_source_id: lessonId })).toMatchObject({
        data: "queued",
      });
      // A worker holds it: another re-index is refused until the job finishes.
      const { data: claimed } = await svc.rpc("claim_knowledge_jobs", {
        p_limit: 1,
        p_source_id: lessonId,
      });
      expect(claimed).toHaveLength(1);
      expect(await svc.rpc("requeue_knowledge_source", { p_source_id: lessonId })).toMatchObject({
        data: "running",
      });
      expect(await processJob(svc, keywordOnly, claimed![0])).toBe("succeeded");
      expect((await source(lessonId)).status).toBe("ready");

      expect(
        await svc.rpc("requeue_knowledge_source", { p_source_id: randomUUID() }),
      ).toMatchObject({ data: "not_found" });
    });
  });

  describe("admin access", () => {
    it("lets an admin list sources across scopes and count them by status", async () => {
      const list = await listKnowledgeSources(admin.client, { q: tag });
      expect(list.ok).toBe(true);
      if (!list.ok) return;
      expect(list.data.total).toBeGreaterThan(5);
      const scopes = new Set(list.data.sources.map((s) => s.scope.type));
      expect(scopes.has("organization")).toBe(true);
      expect(scopes.has("platform")).toBe(true);

      const counts = await getKnowledgeStatusCounts(admin.client);
      expect(counts.ok && counts.data.documents).toBeGreaterThan(0);
      expect(counts.ok && counts.data.failed).toBeGreaterThan(0);
    });

    it("refuses every admin function to learners, instructors and anonymous callers", async () => {
      for (const client of [member.client, instructor.client, anon()]) {
        const calls = await Promise.all([
          client.rpc("admin_list_knowledge_sources", {}),
          client.rpc("admin_knowledge_status_counts", {}),
          client.rpc("admin_match_knowledge_chunks", { p_query: word }),
        ]);
        for (const { error, data } of calls) {
          expect(error).not.toBeNull();
          expect(data ?? null).toBeNull();
        }
      }
      // And through the application's readers: a permission refusal, not an empty result.
      expect(await listKnowledgeSources(member.client, {})).toEqual({
        ok: false,
        error: "permission",
      });
      expect(await testKnowledgeRetrieval(instructor.client, word)).toEqual({
        ok: false,
        error: "permission",
      });
    });

    it("keeps the write functions service-role only", async () => {
      const someSource = sourceIds[0];
      for (const u of [admin, member, instructor]) {
        const attempts = await Promise.all([
          u.client.rpc("create_document_source", {
            p_title: "Nope",
            p_organization_id: null,
            p_storage_path: `platform/${randomUUID()}.txt`,
            p_mime_type: "text/plain",
            p_byte_size: 1,
            p_file_name: "n.txt",
            p_created_by: u.id,
          }),
          u.client.rpc("requeue_knowledge_source", { p_source_id: someSource }),
          u.client.rpc("claim_knowledge_jobs", {
            p_limit: 1,
            p_version_id: null,
            p_source_id: null,
          }),
        ]);
        for (const { error } of attempts) expect(error).not.toBeNull();
      }
    });

    it("rejects malformed document sources at the database", async () => {
      const lessonWithFile = await svc.from("knowledge_sources").insert({
        kind: "lesson",
        title: "x",
        storage_path: `platform/${randomUUID()}.txt`,
        mime_type: "text/plain",
      });
      expect(lessonWithFile.error).not.toBeNull();
      const tooBig = await svc.from("knowledge_sources").insert({
        kind: "document",
        title: "x",
        storage_path: `platform/${randomUUID()}.pdf`,
        mime_type: "application/pdf",
        byte_size: 10 * 1024 * 1024 + 1,
      });
      expect(tooBig.error).not.toBeNull();
      const wrongType = await svc.from("knowledge_sources").insert({
        kind: "document",
        title: "x",
        storage_path: `platform/${randomUUID()}.exe`,
        mime_type: "application/x-msdownload",
      });
      expect(wrongType.error).not.toBeNull();
    });
  });
});
