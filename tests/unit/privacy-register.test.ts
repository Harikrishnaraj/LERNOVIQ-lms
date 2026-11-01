import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// F-440 (T-282): the data-processing register must cover every category with every required field,
// and must never claim compliance.
const doc = readFileSync(join(process.cwd(), "docs", "PRIVACY_REGISTER.md"), "utf8");

const CATEGORIES = [
  "Account/Profile Data",
  "Authentication Data",
  "Learning Progress",
  "Assessment Attempts",
  "Certificates",
  "Submissions",
  "Messages",
  "Audit Logs",
  "Organization Membership",
  "Support Data",
  "Analytics",
  "Report Exports",
  "Uploaded Files",
  "Third-Party Processor Data",
];

const FIELDS = [
  "Purpose",
  "Lawful basis (proposed)",
  "Controller / processors",
  "Access roles and organisation boundary",
  "Storage",
  "Retention and deletion",
  "Subject rights",
  "Security controls",
  "Audit logs",
  "Breach-response owner",
  "International transfers",
];

const sections = doc.split(/\n## \d+\. /).slice(1);

describe("privacy register", () => {
  it("has one section per required category, in order", () => {
    expect(sections.map((s) => s.split("\n")[0].trim())).toEqual(CATEGORIES);
  });

  it.each(CATEGORIES.map((c, i) => [c, sections[i] ?? ""]))("%s lists every required field", (_name, body) => {
    for (const f of FIELDS) expect(body, f).toContain(`**${f}:**`);
  });

  it("marks lawful basis, breach owner and transfers as needing a legal decision in every category", () => {
    for (const s of sections) {
      for (const f of ["Lawful basis (proposed)", "Breach-response owner", "International transfers"]) {
        const line = s.split("\n").find((l) => l.includes(`**${f}:**`)) ?? "";
        const block = s.slice(s.indexOf(line), s.indexOf(line) + 400);
        expect(block, f).toContain("Requires Legal Decision");
      }
    }
  });

  it("never claims GDPR compliance", () => {
    const disclaimer = /Nothing in this file says the\s+platform is GDPR compliant/;
    expect(doc).toMatch(disclaimer);
    expect(doc.replace(disclaimer, "")).not.toMatch(/\bis (fully )?GDPR[- ]compliant\b/i);
  });
});
