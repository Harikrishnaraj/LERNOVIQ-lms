import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function rules() {
  const all = await nextConfig.headers!();
  const app = all.find((r) => r.source === "/:path((?!api/scorm/|api/dispatch/).*)");
  const scorm = all.find((r) => r.source === "/api/scorm/:path*");
  const dispatch = all.find((r) => r.source === "/api/dispatch/:path*");
  return { all, app: app!, scorm: scorm!, dispatch: dispatch! };
}
const byKey = (headers: { key: string; value: string }[]) => Object.fromEntries(headers.map((h) => [h.key, h.value]));

describe("security headers (T-240, SECURITY.md §22)", () => {
  it("applies the strict rule to every route except SCORM package files and content-server dispatch, which get their own", async () => {
    const { all, app, scorm, dispatch } = await rules();
    expect(all).toHaveLength(3);
    expect(app).toBeDefined();
    expect(scorm).toBeDefined();
    expect(dispatch).toBeDefined();
  });

  it("leaves dispatch framing to the route's per-licence CSP, keeping the fixed headers (ADR-041)", async () => {
    const h = byKey((await rules()).dispatch.headers);
    expect(h["Content-Security-Policy"]).toBeUndefined(); // set per request: frame-ancestors = the licence's LMS origins
    expect(h["X-Frame-Options"]).toBeUndefined(); // DENY would block the customer's LMS
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("sets a restrictive CSP with no wildcard script/object sources", async () => {
    const csp = byKey((await rules()).app.headers)["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("script-src *");
    expect(csp).toMatch(/frame-src 'self'/);
  });

  it("sets frame, sniffing, referrer, transport and permissions headers", async () => {
    const h = byKey((await rules()).app.headers);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(h["Permissions-Policy"]).toContain("camera=()");
  });

  it("lets only the app (and the package's own origin) frame SCORM files, never anyone else (ADR-029)", async () => {
    const h = byKey((await rules()).scorm.headers);
    expect(h["X-Frame-Options"]).toBeUndefined(); // DENY would block the player
    expect(h["Content-Security-Policy"]).toMatch(/frame-ancestors 'self'/);
    expect(h["Content-Security-Policy"]).not.toMatch(/frame-ancestors[^;]*\*/);
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });
});
