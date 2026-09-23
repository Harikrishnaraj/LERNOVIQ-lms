import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-023 / F-903: seed fixtures must never be reachable from app code.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("dev seed isolation", () => {
  it("exists as a standalone script outside src/", () => {
    expect(statSync("scripts/seed.mjs").isFile()).toBe(true);
  });

  it("is not imported or referenced by any file under src/", () => {
    const offenders = sourceFiles("src")
      .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
      .filter((f) =>
        /scripts\/seed|seed\.mjs|from ["'][^"']*seed["']/.test(readFileSync(f, "utf8")),
      );
    expect(offenders).toEqual([]);
  });

  it("is exposed only through the npm seed script", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.seed).toBe("node scripts/seed.mjs");
  });
});
