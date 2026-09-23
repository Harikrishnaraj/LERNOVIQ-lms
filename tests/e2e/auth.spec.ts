import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./support/env";

// TEST_PLAN §3 (authentication) and §4 (authorization, UI + direct HTTP).
loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "e2e-auth-pass-1";
const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
const uniqueEmail = (tag: string) =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;

async function createUser(opts: { confirmed?: boolean; onboarded?: boolean } = {}) {
  const admin = db();
  const email = uniqueEmail("auth");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: opts.confirmed ?? true,
  });
  if (error) throw error;
  if (opts.onboarded ?? true) {
    await admin.from("learner_onboarding").insert({ user_id: data.user.id, interests: ["design"] });
  }
  return { id: data.user.id, email, cleanup: () => admin.auth.admin.deleteUser(data.user.id) };
}

async function logIn(page: import("@playwright/test").Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.describe("signup", () => {
  test("invalid email and weak password are rejected before submit", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters")).toBeVisible();
    await expect(page).toHaveURL("/signup");
  });

  test("a password without a number is rejected", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(uniqueEmail("weak"));
    await page.getByLabel("Password", { exact: true }).fill("onlyletters");
    await page.getByLabel("Confirm password").fill("onlyletters");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Password must include a number")).toBeVisible();
  });

  test("a duplicate email is handled without revealing that the account exists", async ({
    page,
  }) => {
    const user = await createUser();
    try {
      await page.goto("/signup");
      await page.getByLabel("Email").fill(user.email);
      await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
      await page.getByLabel("Confirm password").fill(PASSWORD);
      await page.getByRole("button", { name: "Create account" }).click();
      // Same outcome as a brand-new signup: no "already registered" message.
      await expect(page).toHaveURL(/\/verify-email/);
      await expect(page.getByText(/already/i)).toHaveCount(0);
    } finally {
      await user.cleanup();
    }
  });
});

test.describe("login", () => {
  test("valid credentials land on the learner portal", async ({ page }) => {
    const user = await createUser();
    try {
      await logIn(page, user.email);
      await expect(page).toHaveURL("/learner");
    } finally {
      await user.cleanup();
    }
  });

  test("wrong password and unknown email show the same safe error", async ({ page }) => {
    const user = await createUser();
    try {
      await logIn(page, user.email, "wrong-password-1");
      const alert = page.getByRole("alert").filter({ hasText: "Invalid email or password." });
      await expect(alert).toBeVisible();
      await page.getByLabel("Email").fill(uniqueEmail("ghost"));
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(alert).toBeVisible();
    } finally {
      await user.cleanup();
    }
  });

  test("an unverified email cannot log in or reach private routes", async ({ page }) => {
    const user = await createUser({ confirmed: false });
    try {
      await logIn(page, user.email);
      await expect(
        page.getByRole("alert").filter({ hasText: "Invalid email or password." }),
      ).toBeVisible();
      await page.goto("/learner");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await user.cleanup();
    }
  });

  test("a suspended user cannot log in", async ({ page }) => {
    const user = await createUser();
    try {
      await db().from("profiles").update({ status: "suspended" }).eq("id", user.id);
      await logIn(page, user.email);
      await expect(page.getByRole("alert").filter({ hasText: "suspended" })).toBeVisible();
      await page.goto("/learner");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await user.cleanup();
    }
  });
});

test.describe("session", () => {
  test("the session survives a refresh, logout ends it, and a cleared session redirects", async ({
    page,
  }) => {
    const user = await createUser();
    try {
      await logIn(page, user.email);
      await expect(page).toHaveURL("/learner");

      await page.reload();
      await expect(page).toHaveURL("/learner");

      await page.getByRole("button", { name: "Log out" }).click();
      await expect(page).toHaveURL("/login");
      await page.goto("/learner");
      await expect(page).toHaveURL("/login?next=%2Flearner");

      // Expired / missing session on a deep link keeps the destination.
      await page.context().clearCookies();
      await page.goto("/learner/certificates");
      await expect(page).toHaveURL("/login?next=%2Flearner%2Fcertificates");
    } finally {
      await user.cleanup();
    }
  });
});

test.describe("direct HTTP authorization", () => {
  test("anonymous requests are redirected to /login", async ({ request }) => {
    for (const portal of ["learner", "instructor", "admin"]) {
      const res = await request.get(`/${portal}`, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toContain(`/login?next=%2F${portal}`);
    }
  });

  test("a learner session is redirected to permission-denied on instructor and admin routes", async ({
    page,
  }) => {
    const user = await createUser();
    try {
      await logIn(page, user.email);
      await expect(page).toHaveURL("/learner");
      for (const path of ["/instructor", "/instructor/courses", "/admin", "/admin/users"]) {
        const res = await page.request.get(path, { maxRedirects: 0 });
        expect(res.status(), path).toBe(307);
        expect(res.headers()["location"], path).toContain("/permission-denied");
      }
    } finally {
      await user.cleanup();
    }
  });
});
