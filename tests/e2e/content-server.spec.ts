import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type FrameLocator,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import AxeBuilder from "@axe-core/playwright";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import { loadEnvLocal } from "./support/env";
import { loginAsRole } from "./support/role-user";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

loadEnvLocal();

// T-177 (F-520–F-525, TEST_PLAN §25, ADR-041): the content server end to end. An admin sets up a
// customer and licence and downloads the dispatch package; a stand-in SCORM 1.2 LMS (a small local
// web server: http://localhost:<port> is the approved LMS, http://127.0.0.1:<port> plays an
// unapproved one) runs it: launch, progress reaches the LMS, resume, and every refusal case.

const SCO_HTML = `<!doctype html><html><head><title>SCO</title></head><body>
<p id="state">loading</p><button id="finish" onclick="finish()">Finish lesson</button>
<script>
function findAPI(win) {
  for (var i = 0; i < 10 && win; i++) {
    try { if (win.API) return win.API; } catch (e) {}
    if (win.parent === win) break;
    win = win.parent;
  }
  return null;
}
var api = findAPI(window);
window.addEventListener("load", function () {
  var el = document.getElementById("state");
  if (!api) { el.textContent = "NO " + "API"; return; }
  api.LMSInitialize("");
  var resumed = api.LMSGetValue("cmi.core.entry") === "resume" && api.LMSGetValue("cmi.suspend_data") === "step=1";
  api.LMSSetValue("cmi.core.lesson_status", "incomplete");
  api.LMSSetValue("cmi.suspend_data", "step=1");
  api.LMSCommit("");
  el.textContent = "DISPATCH " + "READY " + (resumed ? "resumed" : "fresh") + " for " + api.LMSGetValue("cmi.core.student_name");
});
function finish() {
  api.LMSSetValue("cmi.core.lesson_status", "passed");
  api.LMSSetValue("cmi.core.score.raw", "88");
  api.LMSCommit("");
  document.getElementById("state").textContent = "DISPATCH " + "DONE";
}
</script></body></html>`;

/** A minimal SCORM 1.2 LMS: window.API backed by a store seeded from the URL, recording every call. */
function lmsPage(learner: string, state: Record<string, string>) {
  return `<!doctype html><html><head><title>Stand-in LMS</title></head><body>
<h1>Stand-in LMS</h1>
<script>
window.__store = Object.assign({ "cmi.core.student_id": ${JSON.stringify(learner)}, "cmi.core.student_name": "Learner " + ${JSON.stringify(learner)}, "cmi.core.lesson_status": "not attempted", "cmi.core.entry": "ab-initio" }, ${JSON.stringify(state)});
window.__calls = [];
window.API = {
  LMSInitialize: function () { __calls.push(["init"]); return "true"; },
  LMSFinish: function () { __calls.push(["finish"]); return "true"; },
  LMSGetValue: function (k) { return Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : ""; },
  LMSSetValue: function (k, v) { __calls.push(["set", k, v]); __store[k] = String(v); return "true"; },
  LMSCommit: function () { __calls.push(["commit"]); return "true"; },
  LMSGetLastError: function () { return "0"; },
  LMSGetErrorString: function () { return ""; },
  LMSGetDiagnostic: function () { return ""; },
};
</script>
<iframe id="sco-frame" src="/sco/launch.html" style="width:100%;height:600px" title="Course"></iframe>
</body></html>`;
}

test.describe.configure({ mode: "serial" });

test.describe("content server (ADR-041)", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "One run is enough; the LMS frame chain is the same at every width.",
  );
  test.skip(
    !process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN,
    "The content server needs a separate content origin.",
  );

  const svc = serviceClient();
  const tag = uniqueTag("cse2e");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let courseTitle: string;
  let launcherHtml = "";
  let clientUrl = "";
  let adminUser: Awaited<ReturnType<typeof loginAsRole>> | null = null;
  const extraUsers: Awaited<ReturnType<typeof loginAsRole>>[] = [];
  let lastContentUrl = "";
  let lms: Server;
  let lmsPort = 0;
  let servedLauncher = () => launcherHtml;

  test.beforeAll(async () => {
    lms = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://lms");
      res.setHeader("content-type", "text/html; charset=utf-8");
      if (url.pathname === "/sco/launch.html") return res.end(servedLauncher());
      const state = JSON.parse(url.searchParams.get("state") ?? "{}") as Record<string, string>;
      res.end(lmsPage(url.searchParams.get("learner") ?? "anon", state));
    });
    await new Promise<void>((resolve) => lms.listen(0, "127.0.0.1", resolve));
    lmsPort = (lms.address() as AddressInfo).port;

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    courseTitle = `${tag} Dispatch Course`;
    const course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: courseTitle,
      publish: true,
    });
    courseIds.push(course.courseId);
    const { data: section } = await svc
      .from("course_sections")
      .insert({ version_id: course.versionId, title: "SCORM", position: 5 })
      .select("id")
      .single();
    const { data: lesson } = await svc
      .from("lessons")
      .insert({ section_id: section!.id, title: `${tag} SCO`, type: "scorm" })
      .select("id")
      .single();
    const prefix = `${course.courseId}/${lesson!.id}/e2e`;
    const { error } = await svc.storage
      .from("scorm-packages")
      .upload(`${prefix}/index.html`, Buffer.from(SCO_HTML), {
        contentType: "text/html",
        upsert: true,
      });
    if (error) throw error;
    await svc.from("scorm_packages").insert({
      lesson_id: lesson!.id,
      version: "1.2",
      launch_path: "index.html",
      storage_prefix: prefix,
      file_paths: ["index.html"],
      file_count: 1,
      total_bytes: SCO_HTML.length,
    });
  });

  test.afterAll(async () => {
    await new Promise((resolve) => lms?.close(resolve));
    await svc.from("content_clients").delete().like("name", `${tag}%`);
    await adminUser?.();
    await Promise.all(extraUsers.map((u) => u()));
    await cleanup(svc, { courseIds, userIds });
  });

  async function openLms(
    browser: Browser,
    opts: {
      host?: "localhost" | "127.0.0.1";
      learner: string;
      state?: Record<string, string>;
      launcher?: string;
    },
  ): Promise<{ context: BrowserContext; page: Page; course: FrameLocator }> {
    servedLauncher = () => opts.launcher ?? launcherHtml;
    const context = await browser.newContext();
    const page = await context.newPage();
    const query = new URLSearchParams({
      learner: opts.learner,
      state: JSON.stringify(opts.state ?? {}),
    });
    await page.goto(`http://${opts.host ?? "localhost"}:${lmsPort}/lms.html?${query}`);
    const course = page.frameLocator("#sco-frame").frameLocator("#course");
    return { context, page, course };
  }

  test("an admin sets up a customer and licence and downloads a SCORM 1.2 dispatch package", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    adminUser = await loginAsRole(page, "admin");

    await page.goto("/admin/content-server");
    await expect(page.getByRole("heading", { name: "Content Server" })).toBeVisible();
    await page.getByLabel("Customer name").fill(`${tag} Acme Bank`);
    await page.getByRole("button", { name: "Add customer" }).click();
    await page.waitForURL(/\/admin\/content-server\/[0-9a-f-]{36}$/);
    clientUrl = page.url();

    await page.getByLabel("Licence name").fill("2026 contract");
    await page.getByLabel("Seats (blank = unlimited)").fill("1");
    await page.getByLabel(/LMS web addresses/).fill(`http://localhost:${lmsPort}`);
    await page.getByRole("button", { name: "Create licence" }).click();
    await expect(page.getByRole("heading", { name: "2026 contract" })).toBeVisible();
    await expect(page.getByText("0 / 1")).toBeVisible();

    await page.getByLabel("Find a SCORM 1.2 course").fill(tag);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: `Add ${courseTitle}` }).click();
    await expect(
      page.getByRole("link", { name: `Download package for ${courseTitle}` }),
    ).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: `Download package for ${courseTitle}` }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-scorm12\.zip$/);
    const zip = await JSZip.loadAsync(await readFile((await download.path())!));
    expect(Object.keys(zip.files).sort()).toEqual(["imsmanifest.xml", "launch.html"]);
    expect(await zip.file("imsmanifest.xml")!.async("string")).toContain(
      "<schemaversion>1.2</schemaversion>",
    );
    launcherHtml = await zip.file("launch.html")!.async("string");
  });

  test("the stand-in LMS launches the course; progress, score and completion reach the LMS; a relaunch resumes", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page, course } = await openLms(browser, { learner: "emp-1" });
    const sco = course.frameLocator("#sco");
    await expect(sco.locator("#state")).toHaveText("DISPATCH READY fresh for Learner emp-1", {
      timeout: 30_000,
    });
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __store: Record<string, string> }).__store[
                "cmi.suspend_data"
              ],
          ),
        { timeout: 15_000 },
      )
      .toBe("step=1");

    await sco.getByRole("button", { name: "Finish lesson" }).click();
    await expect(sco.locator("#state")).toHaveText("DISPATCH DONE");
    await expect
      .poll(
        () =>
          page.evaluate(() => (window as unknown as { __store: Record<string, string> }).__store),
        { timeout: 15_000 },
      )
      .toMatchObject({ "cmi.core.lesson_status": "passed", "cmi.core.score.raw": "88" });
    const calls = await page.evaluate(() => (window as unknown as { __calls: string[][] }).__calls);
    expect(calls.some((c) => c[0] === "commit")).toBe(true);
    // Read-only elements are never written back to the LMS.
    expect(calls.filter((c) => c[0] === "set").map((c) => c[1])).not.toContain(
      "cmi.core.student_id",
    );
    lastContentUrl =
      page
        .frames()
        .find((f) => f.url().includes("/api/dispatch/content/"))
        ?.url() ?? "";
    expect(lastContentUrl).toContain("/api/dispatch/content/");
    await context.close();

    // Relaunch with what the LMS saved: the course resumes.
    const again = await openLms(browser, {
      learner: "emp-1",
      state: {
        "cmi.core.lesson_status": "incomplete",
        "cmi.suspend_data": "step=1",
        "cmi.core.entry": "resume",
      },
    });
    await expect(again.course.frameLocator("#sco").locator("#state")).toHaveText(
      "DISPATCH READY resumed for Learner emp-1",
      { timeout: 30_000 },
    );
    await again.context.close();
  });

  test("refuses a new learner over the seat limit, the wrong LMS, and a tampered package", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const seat = await openLms(browser, { learner: "emp-2" });
    await expect(seat.course.locator("[data-reason=seat_limit]")).toContainText(
      "All seats on this course licence are in use",
      { timeout: 30_000 },
    );
    await seat.context.close();

    const other = await openLms(browser, { host: "127.0.0.1", learner: "emp-1" });
    await expect(other.course.locator("[data-reason=not_allowed]")).toContainText(
      "approved learning management system",
      { timeout: 30_000 },
    );
    await other.context.close();

    const tampered = launcherHtml.replace(
      /"signature":"([^"]+)"/,
      (_m, sig: string) => `"signature":"${sig.slice(0, -2)}xx"`,
    );
    expect(tampered).not.toBe(launcherHtml);
    const bad = await openLms(browser, { learner: "emp-1", launcher: tampered });
    await expect(bad.course.locator("[data-reason=not_found]")).toContainText("not valid", {
      timeout: 30_000,
    });
    await bad.context.close();

    // The existing learner still gets in while the licence is full.
    const existing = await openLms(browser, { learner: "emp-1" });
    await expect(existing.course.frameLocator("#sco").locator("#state")).toContainText(
      "DISPATCH READY",
      { timeout: 30_000 },
    );
    await existing.context.close();
  });

  test("usage is reported without learner names, and revoking stops launches and content at once", async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const admin = await loginAsRole(page, "admin");
    extraUsers.push(admin);
    await page.goto(clientUrl);
    await expect(page.getByText("1 / 1")).toBeVisible();
    const usage = page.getByRole("table", { name: /Learners and launches/ });
    await expect(usage.getByRole("row", { name: new RegExp(courseTitle) })).toContainText(
      /1\s*1\s*3$/,
    );
    const csv = await (await page.request.get(`${clientUrl}/usage`)).text();
    expect(csv).toContain(`"${courseTitle}"`);
    expect(csv).not.toContain("emp-1");

    const { data: client } = await svc
      .from("content_clients")
      .select("id")
      .eq("name", `${tag} Acme Bank`)
      .single();
    const { data: regs } = await svc
      .from("content_registrations")
      .select("*, content_licences!inner(client_id)")
      .eq("content_licences.client_id", client!.id);
    expect(regs!.length).toBe(1);
    expect(JSON.stringify(regs)).not.toContain("emp-1");

    await page.getByRole("button", { name: "Revoke" }).click();
    await page.getByRole("button", { name: "Confirm revoke" }).click();
    await expect(page.getByText("Revoked", { exact: true })).toBeVisible();

    const revoked = await openLms(browser, { learner: "emp-1" });
    await expect(revoked.course.locator("[data-reason=revoked]")).toContainText("switched off", {
      timeout: 30_000,
    });
    await revoked.context.close();
    expect((await request.get(lastContentUrl)).status()).toBe(403);

    // The screens meet WCAG 2.2 AA and fit a 375px screen.
    for (const url of [clientUrl, "/admin/content-server"]) {
      await page.goto(url);
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(axe.violations, url).toEqual([]);
      await page.setViewportSize({ width: 375, height: 812 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
        url,
      ).toBe(false);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  });

  test("other back-office roles cannot open the content server", async ({ page }) => {
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto("/admin/content-server");
      await expect(page.getByText("You cannot manage the content server")).toBeVisible();
    } finally {
      await done();
    }
  });
});
