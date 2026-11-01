"use client";

import { useEffect } from "react";
import { recordLessonTime } from "@/features/player/progress";
import { HEARTBEAT_SECONDS, shouldCountHeartbeat } from "@/features/player/time";

/** Sends a heartbeat every 30 seconds while the lesson is open, the tab is visible and the learner is active. */
export function TimeTracker({ lessonId }: { lessonId: string }) {
  useEffect(() => {
    let lastActivity = Date.now();
    const touch = () => {
      lastActivity = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = window.setInterval(() => {
      // A playing video counts as activity even without input.
      const playing = Array.from(document.querySelectorAll("video")).some((v) => !v.paused && !v.ended);
      if (playing) touch();
      if (shouldCountHeartbeat(document.visibilityState === "visible", lastActivity, Date.now())) {
        void recordLessonTime(lessonId, HEARTBEAT_SECONDS);
      }
    }, HEARTBEAT_SECONDS * 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, touch));
    };
  }, [lessonId]);
  return null;
}
