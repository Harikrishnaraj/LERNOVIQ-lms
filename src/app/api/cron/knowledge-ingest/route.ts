import { NextResponse, type NextRequest } from "next/server";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";
import { getEmbeddingProvider } from "@/services/embeddings";
import { createAdminClient } from "@/services/supabase/admin";
import { log } from "@/lib/log";

/**
 * Indexes published lessons for AI Tutor search (T-221, F-800). Called every minute by the cron
 * container with the `CRON_SECRET` bearer token (deploy/docker-compose.yml). Safe to call more
 * often: jobs are claimed with SKIP LOCKED, so overlapping runs never index the same lesson twice.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const summary = await runKnowledgeIngest({
      db: createAdminClient(),
      embedder: getEmbeddingProvider(),
    });
    if (summary.processed > 0 || summary.enqueued > 0)
      log.info("knowledge.ingest.run", { ...summary });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("knowledge.ingest.run_failed", { message });
    return new NextResponse("Indexing run failed", { status: 500 });
  }
}
