import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { serviceClient, uniqueTag } from "../support/course-fixtures";
import { recordAudit } from "@/services/audit";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-414: the audit log screen filters, pages and exports; only audit readers get in.
test.describe("admin audit log", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ae");

  test("filters by action and actor, shows details, and exports CSV (and audits the export)", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await recordAudit({ actorId: done.userId, actorEmail: `carol-${tag}@example.com`, action: "course.published", resourceType: "course", resourceId: `=${tag}-a` });
      await recordAudit({ actorId: done.userId, actorEmail: `dave-${tag}@example.com`, action: "user.suspended", resourceType: "user", resourceId: `${tag}-b` });

      await page.goto(`/admin/audit?resourceType=course&actor=${tag}`);
      await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
      const table = page.getByRole("table");
      await expect(table.getByText(`carol-${tag}@example.com`)).toBeVisible();
      await expect(table.getByText(`dave-${tag}@example.com`)).toHaveCount(0);
      await expect(table.getByText("Course published")).toBeVisible();

      // Filter form: action select.
      await page.goto(`/admin/audit?actor=${tag}`);
      await page.getByLabel("Action").selectOption("user.suspended");
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page).toHaveURL(/action=user\.suspended/);
      await expect(table.getByText(`dave-${tag}@example.com`)).toBeVisible();
      await expect(table.getByText(`carol-${tag}@example.com`)).toHaveCount(0);

      // No results.
      await page.goto("/admin/audit?actor=zzz-nobody-zzz");
      await expect(page.getByText("No events match")).toBeVisible();

      // Export uses the same filters and neutralises formulas.
      const res = await page.request.get(`/admin/audit/export?actor=${tag}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/csv");
      expect(res.headers()["content-disposition"]).toContain("attachment");
      const csv = await res.text();
      expect(csv.split("\r\n")[0]).toContain('"action"');
      expect(csv).toContain(`carol-${tag}@example.com`);
      expect(csv).toContain(`dave-${tag}@example.com`);
      // A value that starts like a formula is neutralised with a leading apostrophe.
      expect(csv).toContain(`"'=${tag}-a"`);
      expect(csv).not.toContain(`"=${tag}-a"`);

      const { data } = await svc.from("audit_logs").select("metadata").eq("action", "audit.exported").eq("actor_id", done.userId);
      expect(data).toHaveLength(1);
      expect((data![0].metadata as { rows: number }).rows).toBe(2);
    } finally {
      await done();
    }
  });

  test("a support agent cannot view or export the audit log", async ({ page }) => {
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto("/admin/audit");
      await expect(page.getByText("You cannot view the audit log")).toBeVisible();
      const res = await page.request.get("/admin/audit/export");
      expect(res.status()).toBe(403);
    } finally {
      await done();
    }
  });

  test("an unauthenticated request to the export is not served", async ({ request }) => {
    const res = await request.get("/admin/audit/export", { maxRedirects: 0 });
    expect([302, 307, 308, 401]).toContain(res.status());
  });
});
