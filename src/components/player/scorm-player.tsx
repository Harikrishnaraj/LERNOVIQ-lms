"use client";

import { useEffect, useRef, useState } from "react";

interface ScormMessage {
  source: "modern-lms-scorm";
  status: "commit" | "finish";
  cmi: Record<string, string>;
}

function isScormMessage(data: unknown): data is ScormMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { source?: unknown }).source === "modern-lms-scorm" &&
    typeof (data as { cmi?: unknown }).cmi === "object"
  );
}

/**
 * Runs SCORM content in a sandboxed iframe with no allow-same-origin, so it cannot reach the real
 * app's window/cookies/storage at all. The package's own launch file has a same-document API shim
 * injected server-side (src/services/scorm/shim.ts); it can only reach this component via
 * postMessage, validated here by event.source rather than by origin (the iframe's origin is
 * opaque under this sandbox). `onCommit` is omitted in instructor preview/review, where there is
 * no enrollment to save progress against.
 */
export function ScormPlayer({
  lessonId,
  launchPath,
  onCommit,
}: {
  lessonId: string;
  launchPath: string;
  onCommit?: (cmi: Record<string, string>) => Promise<unknown>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"active" | "saving" | "saved" | "error">("active");

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isScormMessage(event.data) || !onCommit) return;
      setStatus("saving");
      onCommit(event.data.cmi)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCommit]);

  return (
    <div className="space-y-2">
      <iframe
        ref={iframeRef}
        src={`/api/scorm/${lessonId}/${launchPath.split("/").map(encodeURIComponent).join("/")}`}
        sandbox="allow-scripts"
        title="SCORM content"
        className="h-[70vh] w-full rounded-card border border-border bg-white"
      />
      {status === "error" && <p role="alert" className="text-sm text-danger-text">We could not save your progress just now.</p>}
    </div>
  );
}
