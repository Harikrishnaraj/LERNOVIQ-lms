// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/knowledge/ingest", () => ({
  runKnowledgeIngest: vi.fn(async () => ({
    enqueued: 1,
    processed: 1,
    succeeded: 1,
    unchanged: 0,
    retrying: 0,
    failed: 0,
  })),
}));
vi.mock("@/services/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));

import { GET } from "@/app/api/cron/knowledge-ingest/route";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";

// F-800 (T-221): the indexing endpoint only runs for the cron container's secret.

const call = (auth?: string) =>
  GET(
    new NextRequest("http://localhost/api/cron/knowledge-ingest", {
      headers: auth ? { authorization: auth } : {},
    }),
  );

describe("GET /api/cron/knowledge-ingest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(runKnowledgeIngest).mockClear();
  });

  it("rejects requests without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(runKnowledgeIngest).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("runs the indexer and returns its summary", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ processed: 1, succeeded: 1 });
  });

  it("returns 500 without details when a run fails", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.mocked(runKnowledgeIngest).mockRejectedValueOnce(new Error("db down: secret detail"));
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
  });
});
