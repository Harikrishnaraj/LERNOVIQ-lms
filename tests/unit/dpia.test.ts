import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReportCsv } from "@/features/admin/reports";
import * as usage from "@/features/admin/usage-reports";
import * as user from "@/features/admin/user-reports";

// F-445 (T-287): the DPIA log covers each trigger, and report files never carry a direct identifier.
const doc = readFileSync(join(process.cwd(), "docs", "DPIA.md"), "utf8");

describe("DPIA decision log", () => {
  it("records a decision for profiling, monitoring, sensitive data, AI and analytics", () => {
    const headings = [...doc.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      "Profiling and automated decisions",
      "Monitoring of learners",
      "Sensitive (special category) data",
      "AI processing",
      "Analytics: aggregated or pseudonymised where identity is unnecessary",
    ]);
    for (const section of doc.split(/^## /m).slice(1)) expect(section, section.slice(0, 40)).toMatch(/Decided|Proposed|Requires Legal Decision|Not Applicable/);
    expect(doc).toMatch(/Nothing in this file\s+says the platform is GDPR compliant/);
  });
});

describe("report exports carry no name, email or IP", () => {
  // Every CSV builder, called with no rows, still writes its header line.
  const builders = (
    [...Object.entries(usage), ...Object.entries(user), ["buildReportCsv", buildReportCsv]] as [string, unknown][]
  ).filter(([name]) => /^build\w+Csv$/.test(name)) as [string, (rows: never[]) => string][];

  it("finds every export builder", () => {
    expect(builders.length).toBeGreaterThanOrEqual(9);
  });

  it.each(builders)("%s", (_, build) => {
    const header = build([]).split("\n")[0].toLowerCase().split(",");
    for (const col of header) expect(col).not.toMatch(/name$|email|^ip$|ip_address/);
  });
});
