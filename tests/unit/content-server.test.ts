import { beforeAll, describe, expect, it } from "vitest";
import {
  licenceStatus,
  normalizeOrigin,
  parseOrigins,
  validateClientName,
  validateContactEmail,
  validateExpiry,
  validateLicenceName,
  validateSeatLimit,
} from "@/features/content-server/rules";
import { usageToCsv } from "@/features/content-server/queries";
import {
  dispatchContentOrigin,
  dispatchCsp,
  learnerKey,
  signDispatchId,
  signDispatchToken,
  verifyDispatchId,
  verifyDispatchToken,
  DISPATCH_TOKEN_TTL_SECONDS,
} from "@/services/content-server";
import {
  buildDispatchPackage,
  buildLauncher,
  buildManifest,
  packageFileName,
  WRITABLE_CMI,
} from "@/services/content-server/package";
import {
  dispatchSeedCmi,
  parseLaunchForm,
  refusalPage,
  REFUSALS,
} from "@/services/content-server/launch";
import { validateAndExtractPackage } from "@/services/scorm/parse";

// ADR-041: content server (T-170–T-177). Pure rules, signing, the dispatch package and launch parsing.

const PUBLIC_ID = "0123456789abcdef0123456789abcdef";
const REG = "11111111-1111-4111-8111-111111111111";
const LESSON = "22222222-2222-4222-8222-222222222222";

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "unit-test-service-role-key";
});

describe("content server rules (F-520)", () => {
  it("validates customer and licence fields", () => {
    expect(validateClientName("  Acme Bank ")).toEqual({ ok: true, value: "Acme Bank" });
    expect(validateClientName("").ok).toBe(false);
    expect(validateClientName("x".repeat(201)).ok).toBe(false);
    expect(validateContactEmail("")).toEqual({ ok: true, value: null });
    expect(validateContactEmail("lms@acme.example")).toEqual({
      ok: true,
      value: "lms@acme.example",
    });
    expect(validateContactEmail("not an email").ok).toBe(false);
    expect(validateLicenceName("2026").ok).toBe(true);
    expect(validateLicenceName("  ").ok).toBe(false);
  });

  it("treats blank seats as unlimited and rejects non-whole numbers", () => {
    expect(validateSeatLimit("")).toEqual({ ok: true, value: null });
    expect(validateSeatLimit("250")).toEqual({ ok: true, value: 250 });
    for (const bad of ["0", "-1", "1.5", "ten", "1000001"])
      expect(validateSeatLimit(bad).ok, bad).toBe(false);
  });

  it("stores expiry as the end of the chosen day and rejects past or impossible dates", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(validateExpiry("", now)).toEqual({ ok: true, value: null });
    expect(validateExpiry("2026-12-31", now)).toEqual({
      ok: true,
      value: "2026-12-31T23:59:59.999Z",
    });
    expect(validateExpiry("2026-10-12", now).ok).toBe(true); // works through the end of today
    expect(validateExpiry("2026-10-11", now).ok).toBe(false);
    expect(validateExpiry("2026-02-30", now).ok).toBe(false);
    expect(validateExpiry("31/12/2026", now).ok).toBe(false);
  });

  it("normalizes pasted LMS addresses to origins and requires at least one", () => {
    expect(normalizeOrigin("https://LMS.Acme.example/courses/view.php?id=4")).toBe(
      "https://lms.acme.example",
    );
    expect(normalizeOrigin("lms.acme.example")).toBe("https://lms.acme.example");
    expect(normalizeOrigin("http://localhost:8080/")).toBe("http://localhost:8080");
    for (const bad of [
      "javascript:alert(1)",
      "ftp://x.example",
      "https://user:pw@x.example",
      "https://exa mple.com",
    ]) {
      expect(normalizeOrigin(bad), bad).toBeNull();
    }
    expect(parseOrigins("https://a.example\nhttps://a.example/x, b.example")).toEqual({
      ok: true,
      value: ["https://a.example", "https://b.example"],
    });
    expect(parseOrigins("").ok).toBe(false);
    expect(parseOrigins("not a url at all").ok).toBe(false);
  });

  it("derives licence status: revoked wins, then expiry", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    expect(licenceStatus({ revokedAt: null, expiresAt: null }, now)).toBe("active");
    expect(licenceStatus({ revokedAt: null, expiresAt: "2026-10-11T23:59:59Z" }, now)).toBe(
      "expired",
    );
    expect(
      licenceStatus({ revokedAt: "2026-10-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" }, now),
    ).toBe("revoked");
  });
});

describe("content server signing (SECURITY §27)", () => {
  it("only accepts the signature issued for that dispatch ID", () => {
    const sig = signDispatchId(PUBLIC_ID);
    expect(verifyDispatchId(PUBLIC_ID, sig)).toBe(true);
    expect(verifyDispatchId(PUBLIC_ID.replace("0", "1"), sig)).toBe(false);
    expect(verifyDispatchId(PUBLIC_ID, sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"))).toBe(
      false,
    );
    expect(verifyDispatchId("not-a-dispatch", sig)).toBe(false);
  });

  it("hashes LMS learner IDs per licence, never storing the raw ID", () => {
    const a = learnerKey("licence-1", "learner@acme.example");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("learner");
    expect(learnerKey("licence-1", "learner@acme.example")).toBe(a);
    expect(learnerKey("licence-2", "learner@acme.example")).not.toBe(a);
  });

  it("issues content tokens bound to a registration and lesson that expire", () => {
    const now = Date.UTC(2026, 9, 12);
    const token = signDispatchToken(REG, LESSON, now);
    expect(verifyDispatchToken(token, now)).toEqual({ registrationId: REG, lessonId: LESSON });
    expect(verifyDispatchToken(token, now + DISPATCH_TOKEN_TTL_SECONDS * 1000 + 1)).toBeNull();
    const [r, l, exp, sig] = token.split(".");
    expect(
      verifyDispatchToken([r, "33333333-3333-4333-8333-333333333333", exp, sig].join("."), now),
    ).toBeNull();
    expect(verifyDispatchToken([r, l, String(Number(exp) + 999), sig].join("."), now)).toBeNull();
    expect(verifyDispatchToken("garbage", now)).toBeNull();
  });

  it("requires a content origin on a different host from the app", () => {
    expect(dispatchContentOrigin("https://content.example.com/", "https://app.example.com")).toBe(
      "https://content.example.com",
    );
    expect(dispatchContentOrigin("https://app.example.com", "https://app.example.com")).toBeNull();
    expect(dispatchContentOrigin("", "https://app.example.com")).toBeNull();
    expect(dispatchContentOrigin("not a url", "https://app.example.com")).toBeNull();
  });

  it("limits framing to the licence's LMS origins plus the content origin itself", () => {
    expect(dispatchCsp(["https://lms.acme.example"])).toContain(
      "frame-ancestors 'self' https://lms.acme.example",
    );
    expect(dispatchCsp([])).toContain("frame-ancestors 'self';");
    expect(dispatchCsp("any")).toContain("frame-ancestors *");
  });
});

describe("dispatch package (F-521)", () => {
  const input = {
    publicId: PUBLIC_ID,
    signature: signDispatchId(PUBLIC_ID),
    contentOrigin: "https://content.example.com",
    courseTitle: "AML <Basics> & more",
  };

  it("is a valid SCORM 1.2 package that launches the launcher and holds no course files", async () => {
    const zip = await buildDispatchPackage(input);
    const parsed = await validateAndExtractPackage(zip);
    expect(parsed.version).toBe("1.2");
    expect(parsed.launchPath).toBe("launch.html");
    expect(parsed.files.map((f) => f.path).sort()).toEqual(["imsmanifest.xml", "launch.html"]);
  });

  it("escapes the course title in the manifest and the launcher", () => {
    expect(buildManifest(input)).toContain("<title>AML &lt;Basics&gt; &amp; more</title>");
    const html = buildLauncher({ ...input, courseTitle: "</script><script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)");
  });

  it("carries the dispatch ID, signature and launch URL, and nothing secret", () => {
    const html = buildLauncher(input);
    expect(html).toContain(PUBLIC_ID);
    expect(html).toContain(input.signature);
    expect(html).toContain("https://content.example.com/api/dispatch/launch");
    expect(html).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  });

  it("relays only the SCORM 1.2 elements an SCO may write", () => {
    for (const k of [
      "cmi.core.lesson_status",
      "cmi.core.score.raw",
      "cmi.suspend_data",
      "cmi.core.lesson_location",
      "cmi.objectives.0.id",
      "cmi.interactions.3.result",
    ]) {
      expect(WRITABLE_CMI.test(k), k).toBe(true);
    }
    for (const k of [
      "cmi.core.student_id",
      "cmi.core.student_name",
      "cmi.core.entry",
      "cmi.core.total_time",
      "cmi.objectives._count",
      "cmi.launch_data",
    ]) {
      expect(WRITABLE_CMI.test(k), k).toBe(false);
    }
  });

  it("names the download after the course", () => {
    expect(packageFileName("AML Basics: Part 1")).toBe("aml-basics-part-1-scorm12.zip");
    expect(packageFileName("¿?")).toBe("course-scorm12.zip");
  });
});

describe("dispatch launch (F-522, F-523)", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const valid = {
    dispatch: PUBLIC_ID,
    signature: "sig",
    learner_id: "emp-42",
    learner_name: "Doe, Jane",
    cmi: JSON.stringify({
      "cmi.suspend_data": "step=3",
      "cmi.core.lesson_status": "incomplete",
      "not.cmi": "x",
    }),
  };

  it("parses the launcher's post and drops anything that is not a cmi value", () => {
    expect(parseLaunchForm(form(valid))).toEqual({
      dispatch: PUBLIC_ID,
      signature: "sig",
      learnerId: "emp-42",
      learnerName: "Doe, Jane",
      lmsCmi: { "cmi.suspend_data": "step=3", "cmi.core.lesson_status": "incomplete" },
    });
  });

  it("rejects a post without a learner ID, with a bad dispatch ID, or with broken CMI", () => {
    expect(parseLaunchForm(form({ ...valid, learner_id: "" }))).toBeNull();
    expect(parseLaunchForm(form({ ...valid, dispatch: "abc" }))).toBeNull();
    expect(parseLaunchForm(form({ ...valid, cmi: "{not json" }))).toBeNull();
    expect(parseLaunchForm(form({ ...valid, cmi: "[1,2]" }))).toBeNull();
  });

  it("starts the course from the LMS's saved progress, with the LMS's learner identity", () => {
    const seed = dispatchSeedCmi(parseLaunchForm(form(valid))!);
    expect(seed).toMatchObject({
      "cmi.core.student_id": "emp-42",
      "cmi.core.student_name": "Doe, Jane",
      "cmi.suspend_data": "step=3",
      "cmi.core.lesson_status": "incomplete",
      "cmi.core.entry": "resume",
    });
    const fresh = dispatchSeedCmi(parseLaunchForm(form({ ...valid, cmi: "" }))!);
    expect(fresh).toMatchObject({
      "cmi.core.entry": "ab-initio",
      "cmi.core.lesson_status": "not attempted",
    });
  });

  it("explains every refusal in plain words", () => {
    for (const reason of Object.keys(REFUSALS) as (keyof typeof REFUSALS)[]) {
      const html = refusalPage(reason);
      expect(html).toContain(`data-reason="${reason}"`);
      expect(html).toContain(REFUSALS[reason].message);
    }
  });
});

describe("usage CSV (F-524)", () => {
  it("writes one formula-safe row per licence, course and month", () => {
    const csv = usageToCsv("=Acme", [
      {
        licenceId: "l",
        licenceName: "2026",
        courseId: "c",
        courseTitle: "AML",
        month: "2026-10-01",
        newLearners: 3,
        activeLearners: 5,
        launches: 9,
      },
    ]);
    expect(csv.split("\r\n")[0]).toBe(
      '"client","licence","course","month","new_learners","active_learners","launches"',
    );
    expect(csv).toContain(`"'=Acme","2026","AML","2026-10","3","5","9"`);
  });
});
