"use client";

import { useRef } from "react";
import { shouldPersist, startPosition } from "@/features/player/position";

/**
 * Lesson video that resumes where the learner left off. `onSavePosition` is only passed for
 * enrolled learners (previews are not tracked).
 */
export function ResumableVideo({
  src,
  savedPosition,
  onSavePosition,
}: {
  src: string;
  savedPosition: number;
  onSavePosition?: (seconds: number) => Promise<unknown>;
}) {
  const lastSavedAt = useRef(0);

  function persist(video: HTMLVideoElement) {
    if (!onSavePosition) return;
    lastSavedAt.current = Date.now();
    void onSavePosition(video.currentTime).catch(() => {
      // Best effort: a failed save must never interrupt playback.
    });
  }

  return (
    <video
      controls
      preload="metadata"
      src={src}
      className="aspect-video w-full rounded-card bg-black"
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        const start = startPosition(savedPosition, video.duration);
        if (start > 0) video.currentTime = start;
      }}
      onTimeUpdate={(e) => {
        if (shouldPersist(lastSavedAt.current, Date.now())) persist(e.currentTarget);
      }}
      onPause={(e) => persist(e.currentTarget)}
      onEnded={(e) => {
        if (!onSavePosition) return;
        lastSavedAt.current = Date.now();
        void onSavePosition(0).catch(() => {});
        e.currentTarget.currentTime = 0;
      }}
    >
      Your browser does not support video playback.
    </video>
  );
}
