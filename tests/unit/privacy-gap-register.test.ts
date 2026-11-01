import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// F-446 (T-288): the gap register has the required columns and statuses, and every file and task it cites exists.
const root = process.cwd();
const doc = readFileSync(join(root, "docs", "PRIVACY_GAP_REGISTER.md"), "utf8");
const tasks = readFileSync(join(root, "docs", "TASKS.md"), "utf8");
const lines = doc.split("\n").filter((l) => l.startsWith("| "));
const cells = (l: string) => l.slice(2, -2).split(" | ");
const rows = lines.slice(2).map(cells);
const STATUSES = ["Implemented", "Partially Implemented", "Missing", "Not Applicable", "Requires Legal Decision"];

describe("privacy gap register", () => {
  it("uses the required columns", () => {
    expect(cells(lines[0])).toEqual([
      "Category", "Item / Feature", "Status", "Owner", "Risk Level", "Evidence / Artifact", "Implementation Task", "Test Coverage",
    ]);
  });

  it("gives every row an allowed status, an owner and a risk level", () => {
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const r of rows) {
      expect(r, r[1]).toHaveLength(8);
      expect(STATUSES, r[1]).toContain(r[2]);
      expect(["Engineering", "Operations", "Legal/Privacy"], r[1]).toContain(r[3]);
      expect(["Low", "Medium", "High"], r[1]).toContain(r[4]);
    }
  });

  it("cites only test files and tasks that exist", () => {
    for (const r of rows) {
      for (const [, path] of r[7].matchAll(/`(tests\/[^`]+)`/g)) expect(existsSync(join(root, path)), path).toBe(true);
      for (const [id] of r[6].matchAll(/T-\d{3}/g)) expect(tasks, id).toContain(`**${id}**`);
    }
  });

  it("never claims compliance", () => {
    expect(doc).toMatch(/Nothing in this file says the platform is GDPR compliant/);
  });
});
