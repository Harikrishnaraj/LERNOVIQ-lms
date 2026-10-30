import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// F-442 (T-284): the retention schedule covers every required area, and every job it names exists.
const doc = readFileSync(join(process.cwd(), "docs", "RETENTION.md"), "utf8");
const dir = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(dir)
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");
const backupWorkflow = readFileSync(join(process.cwd(), ".github", "workflows", "backup.yml"), "utf8");

describe("retention schedule", () => {
  it("covers tables, buckets, server logs, exports, backups and vendor tools", () => {
    const headings = [...doc.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(["Database tables", "Storage buckets", "Server logs", "Exports", "Backups", "Vendor tools"]);
  });

  it("cites only scheduled jobs that exist in the migrations", () => {
    const jobs = new Set([...doc.matchAll(/`(purge-[a-z-]+)`/g)].map((m) => m[1]));
    expect(jobs.size).toBeGreaterThanOrEqual(3);
    for (const job of jobs) expect(migrations, job).toContain(`cron.schedule('${job}'`);
  });

  it("cites only purge functions that exist in the migrations", () => {
    const fns = new Set([...doc.matchAll(/`(purge_[a-z_]+)\(\)`/g)].map((m) => m[1]));
    expect(fns.size).toBeGreaterThanOrEqual(3);
    for (const fn of fns) expect(migrations, fn).toContain(`function public.${fn}()`);
  });

  it("keeps the backup retention in step with the workflow", () => {
    expect(backupWorkflow).toContain("retention-days: 30");
    expect(doc).toContain("retention-days: 30");
  });

  it("gives every table row a status and never claims compliance", () => {
    const rows = doc.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| ---") && !/^\| (Data|Bucket|Log|Export|Backup|Vendor) \|/.test(l));
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) expect(row, row).toMatch(/Implemented|Proposed|Gap|Per vendor|Not Applicable/);
    const disclaimer = /Nothing in this file says the\s+platform\s+is\s+GDPR\s+compliant/;
    expect(doc).toMatch(disclaimer);
    expect(doc.replace(disclaimer, "")).not.toMatch(/\bis (fully )?GDPR[- ]compliant\b/i);
  });
});
