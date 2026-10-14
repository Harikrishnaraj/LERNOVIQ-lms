import { beforeEach, describe, expect, it, vi } from "vitest";

const submitEnquiry = vi.fn();
vi.mock("@/features/enquiries/actions", () => ({ submitEnquiry: (...a: unknown[]) => submitEnquiry(...a) }));
vi.mock("@/services/rate-limit", () => ({ RATE_LIMITED_MESSAGE: "Too many attempts. Please wait a while and try again." }));

import { NextRequest } from "next/server";
import { OPTIONS, POST } from "@/app/api/enquiries/route";

// T-264 (ADR-043, SECURITY §28): the static site's contact endpoint only answers allowed origins.
const req = (init: { origin?: string; body?: string; type?: string; method?: string } = {}) =>
  new NextRequest("https://lms.lernoviq.com/api/enquiries", {
    method: init.method ?? "POST",
    headers: {
      ...(init.origin ? { origin: init.origin } : {}),
      "content-type": init.type ?? "application/json",
    },
    body: init.method === "OPTIONS" ? undefined : (init.body ?? "{}"),
  });

describe("POST /api/enquiries", () => {
  beforeEach(() => submitEnquiry.mockReset());

  it("allows the marketing origin, with CORS headers", async () => {
    submitEnquiry.mockResolvedValue({ ok: true });
    const res = await POST(req({ origin: "https://lernoviq.com" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://lernoviq.com");
    const pre = await OPTIONS(req({ origin: "https://www.lernoviq.com", method: "OPTIONS" }));
    expect(pre.status).toBe(204);
  });

  it("refuses other origins, non-JSON and oversized bodies without calling the handler", async () => {
    expect((await POST(req({ origin: "https://evil.example" }))).status).toBe(403);
    expect((await OPTIONS(req({ origin: "https://evil.example", method: "OPTIONS" }))).status).toBe(403);
    expect((await POST(req({ type: "text/plain" }))).status).toBe(415);
    expect((await POST(req({ body: "x".repeat(20_000) }))).status).toBe(413);
    expect((await POST(req({ body: "{bad" }))).status).toBe(400);
    expect(submitEnquiry).not.toHaveBeenCalled();
  });

  it("maps validation and rate-limit failures to 422 and 429", async () => {
    submitEnquiry.mockResolvedValueOnce({ ok: false, error: "x", fieldErrors: { email: "bad" } });
    expect((await POST(req())).status).toBe(422);
    submitEnquiry.mockResolvedValueOnce({ ok: false, error: "Too many attempts. Please wait a while and try again." });
    expect((await POST(req())).status).toBe(429);
  });
});
