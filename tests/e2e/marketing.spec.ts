import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
// Public pages: run signed out.
test.use({ storageState: { cookies: [], origins: [] } });

// T-265 (F-960…F-963, TEST_PLAN §26): the marketing website from the design export (ADR-042).
const PAGES = [
  ["/", "Smarter Learning. Stronger Outcomes."],
  ["/about", "Built on Experience. Driven by Innovation. Designed for the Future of Learning."],
  ["/solutions", "Solutions That Fit Your Learning Goals."],
  ["/lms", "Learning Technology Designed Around Your Organization."],
  ["/industries", "Learning Solutions for Complex, Evolving Industries."],
  ["/delivery", "A Structured Journey from Requirement to Results."],
  ["/faqs", "Questions, answered clearly."],
  ["/contact", "Let’s Build Better Learning Together."],
  ["/cart", "Your cart"],
] as const;

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test.describe("marketing website (T-260…T-264)", () => {
  for (const [path, heading] of PAGES) {
    test(`${path} renders its hero, the site header and footer`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole("banner").getByRole("link", { name: "LERNOVIQ home" })).toBeVisible();
      await expect(page.getByRole("contentinfo")).toContainText("LERNOVIQ AI TECHNOLOGIES PRIVATE LIMITED");
      await noHorizontalScroll(page);
    });
  }

  test("header marks the current page and the menu lists every page", async ({ page, isMobile }) => {
    await page.goto("/about");
    if (isMobile) await page.getByText("Menu", { exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
    await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
    for (const label of ["Home", "Solutions", "Courses", "LERNOVIQ LMS", "Industries", "Delivery", "FAQs"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await nav.getByRole("link", { name: "Solutions" }).click();
    await expect(page).toHaveURL(/\/solutions$/);
  });

  test("LMS tabs switch panels and the accordion toggles", async ({ page }) => {
    await page.goto("/lms");
    await page.getByRole("tab", { name: "Assessments" }).click();
    await expect(page.getByRole("tab", { name: "Assessments" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Assessment and knowledge evaluation");

    const q = page.getByRole("button", { name: "Does LERNOVIQ offer both learning content and an LMS?" });
    await expect(q).toHaveAttribute("aria-expanded", "false");
    await q.click();
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Our model brings together learning consulting")).toBeVisible();
  });

  test("FAQ categories filter the questions", async ({ page }) => {
    await page.goto("/faqs");
    await expect(page.getByRole("button", { name: "What is LERNOVIQ?" })).toBeVisible();
    await page.getByRole("button", { name: "Getting started" }).click();
    await expect(page.getByRole("button", { name: "How do we start?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "What is LERNOVIQ?" })).toHaveCount(0);
  });

  test("delivery stepper updates the detail panel", async ({ page }) => {
    await page.goto("/delivery");
    await expect(page.getByText("STAGE 01 OF 06")).toBeVisible();
    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(page.getByText("STAGE 02 OF 06")).toBeVisible();
    await page.getByRole("button", { name: /Validate/ }).click();
    await expect(page.getByText("STAGE 05 OF 06")).toBeVisible();
    await expect(page.getByText(/^Review instructional integrity/)).toBeVisible();
  });

  test("contact form shows errors, then a confirmation", async ({ page }) => {
    await page.goto("/contact?topic=demo");
    await expect(page.getByRole("heading", { name: "Request an LMS walkthrough" })).toBeVisible();
    await page.getByRole("button", { name: "Request an LMS Demo" }).last().click();
    await expect(page.getByRole("alert").filter({ hasText: "highlighted fields" })).toBeVisible();
    await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

    const tag = uniqueTag("mkt");
    await page.getByLabel("Name").fill(`${tag} Visitor`);
    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByLabel("Organization").fill(`${tag} Org`);
    await page.getByLabel("Country or region").fill("India");
    await page.getByLabel("Industry").selectOption("Training provider");
    await page.getByLabel("Project details").fill("We would like a walkthrough.");
    await page.getByLabel(/I agree that LERNOVIQ/).check();
    await page.getByRole("button", { name: "Request an LMS Demo" }).last().click();
    await expect(page.getByText("Enter a valid work email")).toBeVisible();

    await page.getByLabel("Work email").fill(`${tag}@example.com`);
    await page.getByRole("button", { name: "Request an LMS Demo" }).last().click();
    await expect(page.getByRole("status")).toContainText("Thank you for contacting LERNOVIQ.");

    const svc = serviceClient();
    await svc.from("enquiries").delete().eq("email", `${tag}@example.com`);
  });
});

test.describe("catalogue and cart (T-262, T-263)", () => {
  const svc = serviceClient();
  const tag = uniqueTag("crt");
  const courseIds: string[] = [];
  const userIds: string[] = [];

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    for (const [i, priceCents] of [2500, 4000].entries()) {
      const c = await createCourse(svc, instructor.id, { slug: `${tag}-${i}`, title: `${tag} paid ${i}`, priceCents });
      courseIds.push(c.courseId);
    }
  });

  test.afterAll(async () => {
    await cleanup(svc, { courseIds, userIds });
  });

  test("add to cart, company seats, remove; checkout stays disabled", async ({ page }) => {
    await page.goto(`/courses?q=${tag}`);
    await expect(page.getByRole("status")).toHaveText("2 courses found");
    await page.getByRole("button", { name: `Add ${tag} paid 0 to cart` }).click();
    await page.getByRole("button", { name: `Add ${tag} paid 1 to cart` }).click();
    await expect(page.getByRole("link", { name: "✓ In cart" })).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Cart, 2 courses" }).filter({ visible: true })).toBeVisible();

    await page.goto("/cart");
    const summary = page.getByRole("complementary", { name: "Order summary" });
    await expect(summary).toContainText("$65.00");
    await expect(page.getByRole("button", { name: "Checkout" })).toBeDisabled();
    await expect(page.getByRole("note")).toContainText("Online payment is not available yet");

    await page.getByRole("radio", { name: /My company/ }).click();
    await page.getByLabel(`Seats for ${tag} paid 0`).fill("3");
    await expect(summary).toContainText("4 seats");
    await expect(summary).toContainText("$115.00");
    await expect(page.getByLabel(/GSTIN/)).toBeVisible();

    await page.getByRole("button", { name: `Remove ${tag} paid 0` }).click();
    await page.getByRole("button", { name: `Remove ${tag} paid 1` }).click();
    await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
    await noHorizontalScroll(page);
  });
});
