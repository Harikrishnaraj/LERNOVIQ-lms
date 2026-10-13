import { expect, test, type Page } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { serviceClient, uniqueTag } from "../support/course-fixtures";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";
import type { EmbeddingProvider } from "@/services/embeddings";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

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

// F-800 / F-802 (T-221, T-223, T-225): an admin uploads a document, the worker indexes it, test
// retrieval finds it, a corrupt file ends up in the failed view with its reason, and deleting a
// document removes it from retrieval and storage.
test.describe("admin knowledge base", () => {
  test.describe.configure({ mode: "serial" });
  const svc = serviceClient();
  const tag = uniqueTag("akb");
  const sourceIds: string[] = [];
  const paths: string[] = [];
  const adminCleanups: (() => Promise<unknown>)[] = [];

  test.afterAll(async () => {
    if (paths.length) await svc.storage.from("knowledge-documents").remove(paths);
    if (sourceIds.length) await svc.from("knowledge_sources").delete().in("id", sourceIds);
    for (const done of adminCleanups) await done();
  });

  async function sourceByTitle(title: string) {
    await expect
      .poll(
        async () =>
          (await svc.from("knowledge_sources").select("id").eq("title", title).maybeSingle()).data
            ?.id,
        { timeout: 30_000 },
      )
      .toBeTruthy();
    const { data } = await svc
      .from("knowledge_sources")
      .select("id, storage_path")
      .eq("title", title)
      .single();
    sourceIds.push(data!.id);
    paths.push(data!.storage_path);
    return data!;
  }

  async function upload(
    page: Page,
    file: { name: string; mimeType: string; buffer: Buffer },
    title: string,
  ) {
    await page.getByLabel("Document", { exact: true }).setInputFiles(file);
    await page.getByLabel("Title (optional)").fill(title);
    await page.getByRole("button", { name: "Upload document" }).click();
    await expect(page.getByText(/Uploaded\. The document is queued/)).toBeVisible({
      timeout: 30_000,
    });
  }

  test("uploads a TXT document, indexes it, finds it with test retrieval and deletes it", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    adminCleanups.push(await loginAsRole(page, "admin"));
    const title = `${tag} Refund policy`;
    const word = `${tag}refunds`;

    await page.goto("/admin/knowledge");
    await expect(page.getByRole("heading", { level: 1, name: "Knowledge Base" })).toBeVisible();

    await upload(
      page,
      {
        name: "refunds.txt",
        mimeType: "text/plain",
        buffer: Buffer.from(`Refund rules\n\n${word} are paid back within five working days.`),
      },
      title,
    );

    // It is queued until the worker runs.
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Waiting");

    const { id } = await sourceByTitle(title);
    const summary = await runKnowledgeIngest({ db: svc, embedder: keywordOnly, sourceId: id });
    expect(summary).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });

    await page.reload();
    await expect(row).toContainText("Ready");
    await expect(row).toContainText("refunds.txt");

    // Test retrieval finds the passage.
    await page.getByLabel("Question", { exact: true }).fill(`How long do ${word} take?`);
    await page.getByRole("button", { name: "Test retrieval" }).click();
    const passages = page.getByRole("list", { name: "Ranked passages" });
    await expect(passages).toContainText(title);
    await expect(passages).toContainText("five working days");

    // Delete asks for confirmation first.
    await page
      .getByRole("row", { name: new RegExp(title) })
      .getByRole("button", { name: /Delete/ })
      .click();
    await expect(page.getByText(/removes the document and its passages/)).toBeVisible();
    await page.getByRole("button", { name: /Confirm delete/ }).click();
    await expect(page.getByRole("row", { name: new RegExp(title) })).toHaveCount(0, {
      timeout: 30_000,
    });

    // Gone from retrieval, the database and storage.
    await page.getByLabel("Question", { exact: true }).fill(`How long do ${word} take?`);
    await page.getByRole("button", { name: "Test retrieval" }).click();
    await expect(page.getByText("No passages match this question.")).toBeVisible();
    const { data: left } = await svc.from("knowledge_sources").select("id").eq("id", id);
    expect(left).toEqual([]);
    const { data: chunks } = await svc.from("knowledge_chunks").select("id").eq("source_id", id);
    expect(chunks).toEqual([]);
    const { error: gone } = await svc.storage
      .from("knowledge-documents")
      .download(paths[paths.length - 1]);
    expect(gone).not.toBeNull();
  });

  test("shows a corrupt document in the failed view with a readable reason, and rejects the wrong file type", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const title = `${tag} Broken scan`;
    adminCleanups.push(await loginAsRole(page, "admin"));
    await page.goto("/admin/knowledge");

    // A file with the wrong extension never leaves the browser.
    await page.getByLabel("Document", { exact: true }).setInputFiles({
      name: "virus.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });
    await page.getByRole("button", { name: "Upload document" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "not supported" })).toBeVisible();

    // A .pdf that is not a PDF is refused after upload by its magic bytes.
    await page.getByLabel("Document", { exact: true }).setInputFiles({
      name: "fake.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("<html>this is not a pdf</html>"),
    });
    await page.getByRole("button", { name: "Upload document" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "not a valid PDF" })).toBeVisible({
      timeout: 30_000,
    });

    // A PDF header followed by garbage passes the upload check and fails extraction.
    await upload(
      page,
      {
        name: "scan.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 broken body"),
      },
      title,
    );
    const { id } = await sourceByTitle(title);
    const summary = await runKnowledgeIngest({ db: svc, embedder: keywordOnly, sourceId: id });
    expect(summary).toMatchObject({ processed: 1, failed: 1 });

    await page.goto("/admin/knowledge?status=failed");
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toContainText("Failed");
    await expect(row.getByTestId("source-error")).toContainText("could not be read");
    // Re-index is offered for it, and a failed file stays failed until it is replaced.
    await expect(row.getByRole("button", { name: /Re-index/ })).toBeVisible();
  });
});
