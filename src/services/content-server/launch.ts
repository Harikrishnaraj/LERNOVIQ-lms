import { PUBLIC_ID } from "./index";

// Pure parts of a dispatch launch (T-173, F-522): parsing what the launcher posts, the seed CMI
// the course starts from, and the refusal messages. Unit-tested.

export interface LaunchForm {
  dispatch: string;
  signature: string;
  learnerId: string;
  learnerName: string;
  lmsCmi: Record<string, string>;
}

const CMI_KEY = /^cmi\.[a-z0-9_.]{1,200}$/i;
const MAX_CMI_BYTES = 128 * 1024;

/** Reads the launcher's form post. Null when anything required is missing or malformed. */
export function parseLaunchForm(form: {
  get(name: string): FormDataEntryValue | null;
}): LaunchForm | null {
  const str = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };
  const dispatch = str("dispatch");
  const signature = str("signature");
  const learnerId = str("learner_id").trim();
  const learnerName = str("learner_name").trim().slice(0, 255);
  const cmiText = str("cmi");
  if (!PUBLIC_ID.test(dispatch) || !signature || signature.length > 100) return null;
  if (!learnerId || learnerId.length > 255) return null;
  if (cmiText.length > MAX_CMI_BYTES) return null;

  const lmsCmi: Record<string, string> = {};
  if (cmiText) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(cmiText);
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (CMI_KEY.test(k) && (typeof v === "string" || typeof v === "number"))
        lmsCmi[k] = String(v);
    }
  }
  return { dispatch, signature, learnerId, learnerName, lmsCmi };
}

/**
 * The SCORM 1.2 CMI the course starts from: the LMS's own saved values (so it resumes where the
 * learner left off in their LMS), with the learner identity from the LMS. Nothing is read from or
 * stored in LERNOVIQ (ADR-038: tracking lives in the customer's LMS).
 */
export function dispatchSeedCmi(form: LaunchForm): Record<string, string> {
  const lms = form.lmsCmi;
  const hasProgress = Boolean(lms["cmi.suspend_data"] || lms["cmi.core.lesson_location"]);
  const entry = lms["cmi.core.entry"] || (hasProgress ? "resume" : "ab-initio");
  return {
    "cmi.core.lesson_status": "not attempted",
    "cmi.core.score.raw": "",
    "cmi.core.score.min": "",
    "cmi.core.score.max": "100",
    "cmi.suspend_data": "",
    "cmi.core.lesson_location": "",
    ...lms,
    "cmi.core.student_id": form.learnerId,
    "cmi.core.student_name": form.learnerName || lms["cmi.core.student_name"] || "Learner",
    "cmi.core.entry": entry,
  };
}

export type RefusalReason =
  | "invalid"
  | "not_found"
  | "revoked"
  | "expired"
  | "unavailable"
  | "seat_limit"
  | "not_allowed"
  | "rate_limited";

export const REFUSALS: Record<RefusalReason, { status: number; message: string }> = {
  invalid: {
    status: 400,
    message:
      "This course link is incomplete. Ask your training administrator to upload the course package again.",
  },
  not_found: {
    status: 404,
    message:
      "This course link is not valid. Ask your training administrator to upload a new course package.",
  },
  revoked: {
    status: 403,
    message: "Access to this course has been switched off. Contact your training administrator.",
  },
  expired: {
    status: 403,
    message: "The licence for this course has expired. Contact your training administrator.",
  },
  unavailable: {
    status: 404,
    message: "This course is not available right now. Contact your training administrator.",
  },
  seat_limit: {
    status: 403,
    message:
      "All seats on this course licence are in use, so a new learner cannot start it. Contact your training administrator.",
  },
  not_allowed: {
    status: 403,
    message:
      "This course can only be opened from your organization's approved learning management system.",
  },
  rate_limited: {
    status: 429,
    message:
      "Too many people are starting this course right now. Please wait a minute and try again.",
  },
};

export function refusalPage(reason: RefusalReason): string {
  // Fixed text from REFUSALS (no user input), so it needs no escaping.
  const message = REFUSALS[reason].message;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Course unavailable</title>
<style>body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;background:#fff}p{padding:24px;max-width:40em;margin:0}</style>
</head><body><p role="alert" data-reason="${reason}">${message}</p></body></html>`;
}

/** Child documents of a dispatched package use the host frame's API (same content origin). */
export const DISPATCH_CHILD_SHIM =
  "<script>(function(){try{if(window.parent!==window&&window.parent.API&&!window.API){window.API=window.parent.API;}}catch(e){}})();</script>";
