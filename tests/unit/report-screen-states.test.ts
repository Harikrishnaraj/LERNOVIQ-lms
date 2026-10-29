import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// F-422: every screen that shows report data needs a loading state (loading.tsx) and an error state
// (an error.tsx at the screen or its portal). Permission-denied is checked per page in the app.
const app = join(process.cwd(), "src", "app");
const screens = [
  { name: "admin analytics", dir: "admin/analytics/(view)", errorAt: ["admin"] },
  { name: "instructor analytics", dir: "instructor/analytics", errorAt: ["instructor"] },
  { name: "organization report", dir: "org_admin", errorAt: ["org_admin"] },
  { name: "learner progress", dir: "learner/progress/(view)", errorAt: ["learner/progress", "learner"] },
];

describe("report screens have loading and error states", () => {
  for (const s of screens) {
    it(`${s.name}: loading boundary`, () => {
      expect(existsSync(join(app, s.dir, "loading.tsx"))).toBe(true);
    });
    it(`${s.name}: error boundary`, () => {
      expect(s.errorAt.some((d) => existsSync(join(app, d, "error.tsx")))).toBe(true);
    });
  }
});
