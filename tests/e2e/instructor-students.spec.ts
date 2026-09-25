import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// F-213: the students list with segments, filters and per-student progress.
test.describe("instructor students", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ise");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let teacher: { id: string; email: string; password: string };

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor");
    userIds.push(teacher.id);
    const c1 = await createCourse(svc, teacher.id, {
      slug: `${tag}-c1`, title: `${tag} Alpha`, publish: true,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "L2" }] }],
    });
    const c2 = await createCourse(svc, teacher.id, { slug: `${tag}-c2`, title: `${tag} Beta`, publish: true });
    courseIds.push(c1.courseId, c2.courseId);
    const add = async (name: string, course: typeof c1, enrolled: string, done: number, last: string | null, status = "active") => {
      const u = await createUserWithRole(svc, `${tag}-${name.replace(/[^a-z0-9]/gi, "").toLowerCase()}`, "learner");
      learnerIds.push(u.id);
      await svc.from("profiles").update({ full_name: name }).eq("id", u.id);
      const { data: e } = await svc.from("enrollments").insert({ user_id: u.id, course_id: course.courseId, version_id: course.versionId, enrolled_at: enrolled, status }).select("id").single();
      if (done > 0) {
        await svc.from("lesson_progress").insert(course.lessonIds.slice(0, done).map((lesson_id) => ({ enrollment_id: e!.id, lesson_id, completed_at: last, last_position_seconds: 0, updated_at: last })));
      }
    };
    await add(`${tag} Nina`, c1, daysAgo(1), 0, null);
    await add(`${tag} Otto`, c1, daysAgo(30), 2, daysAgo(2));
    await add(`${tag} Rita`, c1, daysAgo(40), 1, daysAgo(30));
    await add(`${tag} Cleo`, c2, daysAgo(20), 0, null, "completed");
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("lists students with progress, filters by segment, course and name", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page, teacher);
    await page.goto("/instructor/students");
    await expect(page.getByRole("heading", { level: 1, name: "Students" })).toBeVisible();
    const table = page.getByRole("table");
    for (const n of ["Nina", "Otto", "Rita", "Cleo"]) await expect(table.getByText(`${tag} ${n}`)).toBeVisible();

    const otto = table.getByRole("row").filter({ hasText: `${tag} Otto` });
    await expect(otto.getByText("2/2 lessons · 100%")).toBeVisible();
    await expect(otto.getByText("On track")).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: `${tag} Rita` }).getByText("At risk")).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: `${tag} Nina` }).getByText("Just enrolled")).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: `${tag} Cleo` }).getByText("Completed")).toBeVisible();

    // Segment tabs carry counts and filter.
    const tabs = page.getByRole("navigation", { name: "Progress segments" });
    await expect(tabs.getByRole("link", { name: /^At risk \(1\)/ })).toBeVisible();
    await tabs.getByRole("link", { name: /^At risk/ }).click();
    await expect(page).toHaveURL(/segment=at_risk/);
    await expect(table.getByText(`${tag} Rita`)).toBeVisible();
    await expect(table.getByText(`${tag} Otto`)).toHaveCount(0);

    // Course and name filters.
    await page.goto("/instructor/students");
    const beta = (await svc.from("course_versions").select("course_id").eq("title", `${tag} Beta`).single()).data!.course_id as string;
    await page.goto(`/instructor/students?course=${beta}`);
    await expect(table.getByText(`${tag} Cleo`)).toBeVisible();
    await expect(table.getByText(`${tag} Nina`)).toHaveCount(0);
    await page.goto(`/instructor/students?q=${encodeURIComponent(`${tag} otto`)}`);
    await expect(table.getByRole("row")).toHaveCount(2); // header + one
    await page.goto("/instructor/students?q=zzz-nobody");
    await expect(page.getByText("No students match")).toBeVisible();
  });

  test("a new instructor sees the empty state and never other instructors' students", async ({ page }) => {
    const fresh = await createUserWithRole(svc, `${tag}-new`, "instructor");
    userIds.push(fresh.id);
    await signIn(page, fresh);
    await page.goto("/instructor/students");
    await expect(page.getByText("No students yet")).toBeVisible();
    await expect(page.getByText(`${tag} Otto`)).toHaveCount(0);
  });
});
