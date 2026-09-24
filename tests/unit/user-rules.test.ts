import { describe, expect, it } from "vitest";
import {
  checkNewUserRoles,
  checkRoleChange,
  checkStatusChange,
  parseRoleSet,
  validateEmail,
  validatePassword,
} from "@/features/admin/user-rules";
import { parseUserQuery } from "@/features/admin/users";

const admin = { id: "a", roles: ["admin"] };
const superAdmin = { id: "s", roles: ["super_admin"] };

describe("parseRoleSet", () => {
  it("dedupes, and refuses empty and unknown roles", () => {
    expect(parseRoleSet(["learner", "learner", "instructor"])).toEqual({ ok: true, roles: ["learner", "instructor"] });
    expect(parseRoleSet([])).toEqual({ ok: false, error: "Choose at least one role." });
    expect(parseRoleSet("admin")).toEqual({ ok: false, error: "Choose at least one role." });
    expect(parseRoleSet(["root"])).toEqual({ ok: false, error: "Unknown role." });
  });
});

describe("validateEmail / validatePassword", () => {
  it("checks shape and length", () => {
    expect(validateEmail("a@b.co")).toBeNull();
    expect(validateEmail("nope")).not.toBeNull();
    expect(validateEmail("a b@c.d")).not.toBeNull();
    expect(validateEmail("")).not.toBeNull();
    expect(validatePassword("short")).toMatch(/at least 12/);
    expect(validatePassword("long-enough-pass")).toBeNull();
  });
});

describe("checkRoleChange", () => {
  const learner = { id: "t", roles: ["learner"] };

  it("lets an admin change ordinary roles", () => {
    expect(checkRoleChange(admin, learner, ["learner", "instructor"], 1)).toBeNull();
    expect(checkRoleChange(admin, { id: "t", roles: ["instructor"] }, ["learner"], 1)).toBeNull();
  });

  it("refuses a no-op and self-service", () => {
    expect(checkRoleChange(admin, learner, ["learner"], 1)).toMatch(/already/);
    expect(checkRoleChange(admin, { id: "a", roles: ["admin"] }, ["admin", "learner"], 1)).toMatch(/own roles/);
  });

  it("only a super admin may grant, revoke or edit admin access", () => {
    expect(checkRoleChange(admin, learner, ["learner", "admin"], 1)).toMatch(/super admin/);
    expect(checkRoleChange(admin, { id: "t", roles: ["admin"] }, ["learner"], 1)).toMatch(/super admin/);
    expect(checkRoleChange(admin, { id: "t", roles: ["admin", "learner"] }, ["admin"], 1)).toMatch(/super admin/);
    expect(checkRoleChange(superAdmin, learner, ["learner", "admin"], 1)).toBeNull();
  });

  it("never removes the last super admin", () => {
    const target = { id: "t", roles: ["super_admin"] };
    expect(checkRoleChange(superAdmin, target, ["admin"], 1)).toMatch(/at least one super admin/);
    expect(checkRoleChange(superAdmin, target, ["admin"], 2)).toBeNull();
  });
});

describe("checkStatusChange", () => {
  const active = { id: "t", roles: ["learner"], status: "active" };

  it("suspends and reinstates ordinary users", () => {
    expect(checkStatusChange(admin, active, "suspended", 1)).toBeNull();
    expect(checkStatusChange(admin, { ...active, status: "suspended" }, "active", 1)).toBeNull();
  });

  it("refuses self, no-ops and admin targets for non-super admins", () => {
    expect(checkStatusChange(admin, { ...active, id: "a" }, "suspended", 1)).toMatch(/your own/);
    expect(checkStatusChange(admin, active, "active", 1)).toMatch(/already active/);
    expect(checkStatusChange(admin, { ...active, status: "suspended" }, "suspended", 1)).toMatch(/already suspended/);
    expect(checkStatusChange(admin, { ...active, roles: ["admin"] }, "suspended", 1)).toMatch(/super admin/);
    expect(checkStatusChange(superAdmin, { ...active, roles: ["admin"] }, "suspended", 1)).toBeNull();
  });

  it("never suspends the last active super admin", () => {
    const target = { id: "t", roles: ["super_admin"], status: "active" };
    expect(checkStatusChange(superAdmin, target, "suspended", 1)).toMatch(/at least one active super admin/);
    expect(checkStatusChange(superAdmin, target, "suspended", 2)).toBeNull();
  });
});

describe("checkNewUserRoles", () => {
  it("only a super admin creates admin accounts", () => {
    expect(checkNewUserRoles(admin, ["instructor"])).toBeNull();
    expect(checkNewUserRoles(admin, ["admin"])).toMatch(/super admin/);
    expect(checkNewUserRoles(superAdmin, ["super_admin"])).toBeNull();
  });
});

describe("parseUserQuery", () => {
  it("defaults and ignores junk", () => {
    expect(parseUserQuery({})).toEqual({ q: "", role: "", status: "", page: 1 });
    expect(parseUserQuery({ role: "root", status: "gone", page: "-3" })).toEqual({ q: "", role: "", status: "", page: 1 });
    expect(parseUserQuery({ q: " ada ", role: "instructor", status: "suspended", page: "3" })).toEqual({
      q: "ada",
      role: "instructor",
      status: "suspended",
      page: 3,
    });
    expect(parseUserQuery({ page: "abc" }).page).toBe(1);
  });
});
