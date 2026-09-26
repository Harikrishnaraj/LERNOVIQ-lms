import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const MANIFEST = `<?xml version="1.0"?>
<manifest identifier="com.e2e.course" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>E2E SCORM Course</title>
      <item identifier="ITEM1" identifierref="RES1"><title>Lesson 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" href="index.html" adlcp:scormtype="sco" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

const LAUNCH_HTML = `<!doctype html><html><head><title>SCO</title></head><body>
<script>
window.API.LMSInitialize("");
window.API.LMSSetValue("cmi.core.lesson_status", "passed");
window.API.LMSSetValue("cmi.core.score.raw", "88");
window.API.LMSCommit("");
document.body.textContent = "SCORM E2E COMPLETE";
</script>
</body></html>`;

async function buildScormZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("imsmanifest.xml", MANIFEST);
  zip.file("index.html", LAUNCH_HTML);
  return zip.generateAsync({ type: "nodebuffer" });
}

// F-410: Content, media & SCORM (T-138)
test.describe("SCORM package upload and launch", () => {
  const svc = serviceClient();
  const tag = uniqueTag("scorme2e");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let instructor: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let lessonId: string;

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const { data: section } = await svc
      .from("course_sections")
      .insert({ version_id: course.versionId, title: `${tag} Section 2` })
      .select("id")
      .single();
    const { data: lesson } = await svc
      .from("lessons")
      .insert({ section_id: section!.id, title: `${tag} SCORM Lesson`, type: "scorm" })
      .select("id")
      .single();
    lessonId = lesson!.id;
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("instructor uploads a SCORM package and a learner completes it (T-138)", async ({ page }) => {
    test.setTimeout(180_000);

    // 1. Instructor uploads the package via the lesson editor.
    await page.goto("/login");
    await page.getByLabel("Email").fill(instructor.email);
    await page.getByLabel("Password").fill(instructor.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto(`/instructor/courses/${course.courseId}/lessons/${lessonId}`);
    const zip = await buildScormZip();
    await page.getByLabel("Upload SCORM package").setInputFiles({ name: "package.zip", mimeType: "application/zip", buffer: zip });
    await expect(page.getByText("Package uploaded.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/SCORM 1\.2 package/)).toBeVisible();

    // 2. A learner, enrolled in the course, launches it and the SCO reports "passed".
    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);
    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId, status: "active" })
      .select("id")
      .single();

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/(learner|mfa)/);

    await page.goto(`/learner/courses/${course.slug}/learn/${lessonId}`);
    const frame = page.frameLocator('iframe[title="SCORM content"]');
    await expect(frame.locator("body")).toContainText("SCORM E2E COMPLETE", { timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const { data } = await svc
            .from("lesson_progress")
            .select("completed_at")
            .eq("lesson_id", lessonId)
            .eq("enrollment_id", enrollment!.id)
            .maybeSingle();
          return data?.completed_at ?? null;
        },
        { timeout: 30_000 },
      )
      .not.toBeNull();
  });
});
