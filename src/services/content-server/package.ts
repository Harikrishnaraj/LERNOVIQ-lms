import JSZip from "jszip";
import { escapeForInlineScript } from "@/services/scorm/cmi";

/**
 * Dispatch packages (T-172, F-521, ADR-038): a SCORM 1.2 zip the customer uploads into their own
 * LMS. It holds only a manifest and a launcher page, never course files. The launcher (T-175,
 * F-523) finds the LMS's SCORM 1.2 API, posts the learner ID and the LMS's saved progress to the
 * launch endpoint on our content origin, shows the course in a frame, and relays the progress the
 * course reports back to the LMS.
 */

export interface DispatchPackageInput {
  publicId: string;
  signature: string;
  /** Our content origin, e.g. https://content-1-2-3-4.sslip.io (dispatchContentOrigin()). */
  contentOrigin: string;
  courseTitle: string;
}

export const LAUNCHER_FILE = "launch.html";

function xml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}

export function buildManifest(
  input: Pick<DispatchPackageInput, "publicId" | "courseTitle">,
): string {
  const title = xml(input.courseTitle.slice(0, 200) || "Course");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="lernoviq-${input.publicId}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${title}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${title}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="${LAUNCHER_FILE}">
      <file href="${LAUNCHER_FILE}" />
    </resource>
  </resources>
</manifest>
`;
}

/** SCORM 1.2 elements an SCO may write (data model, read/write or write-only). Everything else is read-only in the LMS. */
export const WRITABLE_CMI =
  /^cmi\.(core\.(lesson_location|lesson_status|score\.(raw|min|max)|exit|session_time)|suspend_data|comments|objectives\.\d+\.|student_preference\.|interactions\.\d+\.)/;

/** Values read from the LMS before launch, so the course resumes where the learner left off. */
export const SEED_CMI_KEYS = [
  "cmi.core.student_name",
  "cmi.core.lesson_location",
  "cmi.core.credit",
  "cmi.core.lesson_status",
  "cmi.core.entry",
  "cmi.core.score.raw",
  "cmi.core.score.min",
  "cmi.core.score.max",
  "cmi.core.total_time",
  "cmi.core.lesson_mode",
  "cmi.suspend_data",
  "cmi.launch_data",
] as const;

export function buildLauncher(input: DispatchPackageInput): string {
  const config = escapeForInlineScript({
    launchUrl: `${input.contentOrigin}/api/dispatch/launch`,
    contentOrigin: input.contentOrigin,
    dispatch: input.publicId,
    signature: input.signature,
    seedKeys: SEED_CMI_KEYS,
    writable: WRITABLE_CMI.source,
  });
  const title = xml(input.courseTitle.slice(0, 200) || "Course");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
html,body{margin:0;height:100%;background:#fff}
iframe{border:0;width:100%;height:100%;display:block}
#msg{font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;padding:24px;max-width:40em}
</style></head>
<body>
<p id="msg" role="alert" hidden></p>
<iframe name="lernoviq-course" id="course" title="${title}" allow="autoplay; fullscreen"></iframe>
<script>(function () {
  var CONFIG = ${config};
  var WRITABLE = new RegExp(CONFIG.writable);
  var frame = document.getElementById("course");
  function show(text) {
    var el = document.getElementById("msg");
    el.textContent = text;
    el.hidden = false;
    frame.style.display = "none";
  }
  function scan(win) {
    for (var n = 0; win && n < 20; n++) {
      try { if (win.API) return win.API; } catch (e) {}
      try { if (!win.parent || win.parent === win) break; win = win.parent; } catch (e) { break; }
    }
    return null;
  }
  var api = scan(window);
  if (!api) { try { if (window.top && window.top.opener) api = scan(window.top.opener); } catch (e) {} }
  if (!api) { show("This course must be opened from your learning management system."); return; }

  api.LMSInitialize("");
  function get(k) { try { var v = api.LMSGetValue(k); return v === null || v === undefined ? "" : String(v); } catch (e) { return ""; } }
  var learnerId = get("cmi.core.student_id");
  if (!learnerId) { show("Your learning management system did not provide a learner ID, so this course cannot start."); return; }
  var seed = {};
  CONFIG.seedKeys.forEach(function (k) { var v = get(k); if (v !== "") seed[k] = v; });
  var sent = {};
  Object.keys(seed).forEach(function (k) { sent[k] = seed[k]; });

  var finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    try { api.LMSFinish(""); } catch (e) {}
  }
  window.addEventListener("message", function (e) {
    if (finished || e.origin !== CONFIG.contentOrigin || e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || d.source !== "lernoviq-scorm" || typeof d.cmi !== "object" || d.cmi === null) return;
    var changed = false;
    Object.keys(d.cmi).forEach(function (k) {
      var v = String(d.cmi[k]);
      if (WRITABLE.test(k) && sent[k] !== v) {
        try { api.LMSSetValue(k, v); sent[k] = v; changed = true; } catch (err) {}
      }
    });
    if (changed || d.status === "commit") { try { api.LMSCommit(""); } catch (err) {} }
    if (d.status === "finish") finish();
  });
  window.addEventListener("pagehide", finish);

  var form = document.createElement("form");
  form.method = "post";
  form.action = CONFIG.launchUrl;
  form.target = "lernoviq-course";
  [["dispatch", CONFIG.dispatch], ["signature", CONFIG.signature], ["learner_id", learnerId],
   ["learner_name", get("cmi.core.student_name")], ["cmi", JSON.stringify(seed)]].forEach(function (f) {
    var input = document.createElement("input");
    input.type = "hidden";
    input.name = f[0];
    input.value = f[1];
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
})();</script>
</body></html>
`;
}

export async function buildDispatchPackage(input: DispatchPackageInput): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("imsmanifest.xml", buildManifest(input));
  zip.file(LAUNCHER_FILE, buildLauncher(input));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** File name for the download: course title, safe for every OS. */
export function packageFileName(courseTitle: string): string {
  const slug = courseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "course"}-scorm12.zip`;
}
