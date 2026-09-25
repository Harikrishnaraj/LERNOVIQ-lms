import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Next.js only allows async functions (and types) to be exported from a "use server" file; a
// constant export breaks the build with a confusing error. This catches it in the unit tests.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('"use server" files', () => {
  const serverFiles = files("src").filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")));

  it("finds the server action files", () => {
    expect(serverFiles.length).toBeGreaterThan(10);
  });

  it.each(serverFiles)("%s exports only async functions and types", (file) => {
    const bad = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^export\s/.test(line))
      .filter((line) => !/^export\s+(async\s+function|type|interface)\s/.test(line))
      .filter((line) => !/^export\s*\{[^}]*\}\s*from/.test(line) || /\bconst\b/.test(line));
    expect(bad).toEqual([]);
  });
});
