import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("security headers (T-240, SECURITY.md §22)", () => {
  it("applies a catch-all header rule to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
  });

  it("sets a restrictive CSP with no wildcard script/object sources", async () => {
    const [{ headers }] = await nextConfig.headers!();
    const csp = headers.find((h) => h.key === "Content-Security-Policy")?.value;
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("script-src *");
  });

  it("sets frame, sniffing, referrer, transport and permissions headers", async () => {
    const [{ headers }] = await nextConfig.headers!();
    const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Strict-Transport-Security"]).toContain("max-age=");
    expect(byKey["Permissions-Policy"]).toContain("camera=()");
  });
});
