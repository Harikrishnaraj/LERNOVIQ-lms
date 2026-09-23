import { describe, expect, it } from "vitest";
import { NAVIGATION, activeNavHref, allNavItems } from "@/config/navigation";
import { PORTALS } from "@/types/portal";

describe("navigation config", () => {
  it.each(PORTALS)("%s: hrefs are unique and live under the portal namespace", (portal) => {
    const hrefs = allNavItems(portal).map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) expect(h === `/${portal}` || h.startsWith(`/${portal}/`)).toBe(true);
    expect(hrefs).toContain(NAVIGATION[portal].home);
  });

  it.each(PORTALS)("%s: every item references a task", (portal) => {
    for (const i of allNavItems(portal)) expect(i.task).toMatch(/^T-\d{3}[a-z]?$/);
  });

  it("learner mobile bar has at most 4 links (+ More) that exist in the nav", () => {
    const bar = NAVIGATION.learner.mobileBar ?? [];
    expect(bar.length).toBeLessThanOrEqual(4);
    const hrefs = allNavItems("learner").map((i) => i.href);
    for (const h of bar) expect(hrefs).toContain(h);
  });
});

describe("activeNavHref", () => {
  it("matches the portal home only exactly", () => {
    expect(activeNavHref("learner", "/learner")).toBe("/learner");
    expect(activeNavHref("learner", "/learner/unknown")).toBeUndefined();
  });
  it("prefers the most specific item", () => {
    expect(activeNavHref("instructor", "/instructor/courses/new")).toBe("/instructor/courses/new");
    expect(activeNavHref("instructor", "/instructor/courses/abc/curriculum")).toBe(
      "/instructor/courses",
    );
  });
  it("ignores trailing slashes", () => {
    expect(activeNavHref("admin", "/admin/users/")).toBe("/admin/users");
  });
});
