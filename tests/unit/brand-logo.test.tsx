import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (path: string) => readFileSync(path, "utf8");

// Static imports of images are plain strings under Vitest, so the placement is checked in source.
describe("logo placement (brand guide §5)", () => {
  it("shows the secondary mark on small screens and the primary from md up in both headers", () => {
    for (const file of [
      "src/components/marketing/site-header.tsx",
      "src/components/layout/public-header.tsx",
    ]) {
      const code = src(file);
      expect(code).toMatch(/<BrandLogo variant="secondary" width=\{96\} className="md:hidden" \/>/);
      expect(code).toMatch(/<BrandLogo width=\{\d+\} className="hidden md:inline-block" \/>/);
    }
  });

  it("uses the secondary mark in the portal sidebar", () => {
    expect(src("src/components/layout/portal-shell.tsx")).toContain(
      '<BrandLogo variant="secondary" width={96} />',
    );
  });
});
