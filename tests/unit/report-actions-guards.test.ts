import { beforeEach, describe, expect, it, vi } from "vitest";

// Run now and past-export links are rate limited (report audit C20), and a saved report whose stored
// filters no longer validate is refused instead of running unfiltered (report audit C19).

let storedFilters: unknown = {};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "r1", name: "R", report_type: "idle_users", range_days: 30, filters: storedFilters },
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/permissions/can", () => ({ can: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let allowed = true;
const rateLimit = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => allowed);
vi.mock("@/services/rate-limit", () => ({
  clientIp: async () => "127.0.0.1",
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  RATE_LIMITED_MESSAGE: "Too many attempts. Please wait a while and try again.",
}));
const generate = vi.fn();
vi.mock("@/features/admin/report-generation", () => ({ generateReportCsv: (...a: unknown[]) => generate(...a) }));
vi.mock("@/services/storage", () => ({ REPORT_EXPORT_BUCKET: "report-exports", supabaseStorage: {} }));
vi.mock("@/features/admin/report-export-policy", () => ({ EXPORT_LINK_SECONDS: 60, logExportDownload: vi.fn(), logReportEvent: vi.fn() }));

import { getExportDownloadUrlAction, runReportNowAction } from "@/features/admin/report-actions";

describe("saved report action guards", () => {
  beforeEach(() => {
    allowed = true;
    storedFilters = {};
    rateLimit.mockClear();
    generate.mockReset();
    generate.mockResolvedValue({ ok: false, error: "stop here" });
  });

  it("rate limits Run now per user", async () => {
    allowed = false;
    expect(await runReportNowAction("r1")).toEqual({ ok: false, error: "Too many attempts. Please wait a while and try again." });
    expect(rateLimit).toHaveBeenCalledWith("report-run", "127.0.0.1", "u1");
    expect(generate).not.toHaveBeenCalled();
  });

  it("rate limits past-export download links per user", async () => {
    allowed = false;
    expect(await getExportDownloadUrlAction("x1")).toEqual({ ok: false, error: "Too many attempts. Please wait a while and try again." });
    expect(rateLimit).toHaveBeenCalledWith("report-run", "127.0.0.1", "u1");
  });

  it("refuses to run a report whose stored filters are no longer valid", async () => {
    storedFilters = { userId: "not-a-uuid" };
    expect(await runReportNowAction("r1")).toEqual({
      ok: false,
      error: "This report's filters are no longer valid. Delete it and save it again.",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("runs with valid stored filters", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    storedFilters = { userId };
    await runReportNowAction("r1");
    expect(generate).toHaveBeenCalledWith(expect.anything(), { type: "idle_users", rangeDays: 30, filters: { userId } });
  });
});
