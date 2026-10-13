"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteKnowledgeDocument,
  reindexKnowledgeSource,
} from "@/features/knowledge/admin-actions";

interface Props {
  sourceId: string;
  title: string;
  kind: "lesson" | "lesson_asset" | "document";
}

/** Re-index (lessons and documents) and delete (documents only, after a confirmation step). */
export function KnowledgeSourceActions({ sourceId, title, kind }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reindex" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kindOfAction: "reindex" | "delete") {
    setBusy(kindOfAction);
    setError(null);
    try {
      const result =
        kindOfAction === "reindex"
          ? await reindexKnowledgeSource(sourceId)
          : await deleteKnowledgeDocument(sourceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void run("reindex")}
          loading={busy === "reindex"}
          disabled={busy !== null}
        >
          {busy !== "reindex" && <RefreshCw className="size-3.5" aria-hidden="true" />}
          Re-index<span className="sr-only"> {title}</span>
        </Button>
        {kind === "document" &&
          (confirming ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void run("delete")}
                loading={busy === "delete"}
                disabled={busy !== null}
              >
                Confirm delete<span className="sr-only"> {title}</span>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete<span className="sr-only"> {title}</span>
            </Button>
          ))}
      </div>
      {confirming && (
        <p className="text-xs text-text-secondary">
          This removes the document and its passages from AI Tutor search.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
