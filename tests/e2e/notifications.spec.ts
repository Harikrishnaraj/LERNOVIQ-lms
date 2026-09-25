import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { notify } from "@/services/notifications";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-115: bell with unread count, list with read/unread, filters, delete, and preferences.
test.describe("notifications", () => {
  const svc = serviceClient();
  const tag = uniqueTag("nte");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let learner: { id: string; email: string; password: string };
  let instructor: { id: string; email: string; password: string };

  async function signIn(page: Page, u: { email: string; password: string }, landing: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(landing);
  }

  test.beforeAll(async () => {
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    learnerIds.push(learner.id);
    userIds.push(instructor.id);
    await notify({ userId: learner.id, category: "assignment", title: `${tag} Graded`, body: "You got 90", href: "/learner/assignments" });
    await notify({ userId: learner.id, category: "course", title: `${tag} Certificate`, href: "/learner/certificates" });
    await notify({ userId: instructor.id, category: "review", title: `${tag} Course approved` });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds: [], userIds }));

  test("the bell shows the unread count; the list marks read, filters, deletes; preferences stop new ones", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page, learner, "/learner");
    await expect(page.getByRole("link", { name: "Notifications, 2 unread" })).toBeVisible();
    await page.getByRole("link", { name: "Notifications, 2 unread" }).click();
    await expect(page).toHaveURL(/\/learner\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    const list = page.getByRole("list", { name: "Notifications" });
    const graded = list.getByRole("listitem").filter({ hasText: `${tag} Graded` });
    await expect(graded.getByText("Unread")).toBeVisible();
    await expect(graded.getByText("You got 90")).toBeVisible();
    await expect(graded.getByRole("link", { name: `${tag} Graded` })).toHaveAttribute("href", "/learner/assignments");

    // Mark one as read: the badge drops and the unread filter hides it.
    await graded.getByRole("button", { name: /Mark as read/ }).click();
    await expect(page.getByRole("link", { name: "Notifications, 1 unread" })).toBeVisible();
    await page.getByRole("navigation", { name: "Filter notifications" }).getByRole("link", { name: "Unread" }).click();
    await expect(page).toHaveURL(/filter=unread/);
    await expect(page.getByRole("list", { name: "Notifications" }).getByText(`${tag} Graded`)).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Notifications" }).getByRole("link", { name: `${tag} Certificate` })).toBeVisible();

    // Mark all as read: caught up.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(page.getByText("You are all caught up")).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Notifications", exact: true })).toBeVisible();

    // Delete from the full list.
    await page.getByRole("navigation", { name: "Filter notifications" }).getByRole("link", { name: "All" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("list", { name: "Notifications" }).getByRole("link", { name: `${tag} Certificate` })).toBeVisible();
    await page.getByRole("list", { name: "Notifications" }).getByRole("listitem").filter({ hasText: `${tag} Certificate` }).getByRole("button", { name: /Delete/ }).click();
    await expect(page.getByRole("list", { name: "Notifications" }).getByRole("link", { name: `${tag} Certificate` })).toHaveCount(0);

    // Preferences: switching a category off stops new notifications of that category.
    await page.getByLabel("In-app notifications for Assignments").uncheck();
    await expect
      .poll(async () => (await svc.from("notification_preferences").select("in_app").eq("user_id", learner.id).eq("category", "assignment").maybeSingle()).data?.in_app)
      .toBe(false);
    expect(await notify({ userId: learner.id, category: "assignment", title: `${tag} Muted` })).toBe(false);
    await page.reload();
    await expect(page.getByLabel("In-app notifications for Assignments")).not.toBeChecked();
    await expect(page.getByLabel("In-app notifications for Courses")).toBeChecked();
  });

  test("instructors have their own notifications page and bell", async ({ page }) => {
    await signIn(page, instructor, "/instructor");
    await page.getByRole("link", { name: "Notifications, 1 unread" }).click();
    await expect(page).toHaveURL(/\/instructor\/notifications$/);
    await expect(page.getByRole("list", { name: "Notifications" }).getByText(`${tag} Course approved`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Course reviews", { exact: true }).first()).toBeVisible();
  });

  test("a new user sees the empty state and no badge", async ({ page }) => {
    const fresh = await createUserWithRole(svc, `${tag}-new`, "learner");
    learnerIds.push(fresh.id);
    await signIn(page, fresh, "/learner");
    await expect(page.getByRole("banner").getByRole("link", { name: "Notifications", exact: true })).toBeVisible();
    await page.goto("/learner/notifications");
    await expect(page.getByText("No notifications yet")).toBeVisible();
  });
});
