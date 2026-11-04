import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// F-450 (T-301): the breach procedure names its owners, deadlines and a breach record.
const doc = readFileSync(join(process.cwd(), "docs", "RUNBOOKS.md"), "utf8");
const section = doc.slice(doc.indexOf("## Personal-data breach response"));

describe("breach response runbook", () => {
  it("exists", () => {
    expect(section.startsWith("## Personal-data breach response")).toBe(true);
  });

  it("names the owners and the notification deadlines", () => {
    expect(section).toMatch(/Breach owner/);
    expect(section).toMatch(/72 hours/);
    expect(section).toMatch(/48 hours/);
    expect(section).toMatch(/Data Protection Board of India/);
  });

  it("keeps a breach record table", () => {
    expect(section).toMatch(/### Breach record[\s\S]*\| Date aware \|/);
  });
});
