import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const key = (n: number) => n.toString(16).padStart(64, "0");

// T-171/T-173/T-176 (F-520, F-522, F-524, ADR-041): which courses can be dispatched, the atomic
// launch check (licence, expiry, seats) and the usage report, against a live database.
describe.skipIf(!hasLiveProject)("content server launch & usage (live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("csl");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const clientIds: string[] = [];

  let admin: SupabaseClient;
  let support: SupabaseClient;
  let scormCourse: string, scorm2004Course: string, plainCourse: string, otherScormCourse: string;
  let clientId: string, licenceId: string;
  let dispatchA: string, dispatchB: string;

  async function signedIn(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { error } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (error) throw error;
    return { id: u.id, client };
  }

  async function courseWithScorm(
    name: string,
    version: "1.2" | "2004" | null,
    instructorId: string,
  ) {
    const c = await createCourse(svc, instructorId, {
      slug: `${tag}-${name}`,
      title: `${tag} ${name}`,
      publish: true,
    });
    courseIds.push(c.courseId);
    if (version) {
      const { data: section } = await svc
        .from("course_sections")
        .insert({ version_id: c.versionId, title: "SCORM", position: 9 })
        .select("id")
        .single();
      const { data: lesson } = await svc
        .from("lessons")
        .insert({ section_id: section!.id, title: `${name} SCO`, type: "scorm" })
        .select("id")
        .single();
      await svc.from("scorm_packages").insert({
        lesson_id: lesson!.id,
        version,
        launch_path: "index.html",
        storage_prefix: `${c.courseId}/${lesson!.id}/test`,
        file_paths: ["index.html"],
        file_count: 1,
        total_bytes: 10,
      });
    }
    return c.courseId;
  }

  async function launch(publicId: string, learner: number) {
    const { data, error } = await svc.rpc("register_content_launch", {
      p_public_id: publicId,
      p_learner_key: key(learner),
    });
    if (error) throw error;
    return data as { status: string; registration_id?: string; lesson_id?: string };
  }

  beforeAll(async () => {
    const a = await signedIn("adm", "admin");
    admin = a.client;
    support = (await signedIn("sa", "support_agent")).client;
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    [scormCourse, scorm2004Course, plainCourse, otherScormCourse] = await Promise.all([
      courseWithScorm("s12", "1.2", instructor.id),
      courseWithScorm("s2004", "2004", instructor.id),
      courseWithScorm("plain", null, instructor.id),
      courseWithScorm("s12b", "1.2", instructor.id),
    ]);

    const { data: c } = await svc
      .from("content_clients")
      .insert({ name: `${tag} Client` })
      .select("id")
      .single();
    clientId = c!.id;
    clientIds.push(clientId);
    const { data: l } = await svc
      .from("content_licences")
      .insert({
        client_id: clientId,
        name: "seats",
        seat_limit: 2,
        allowed_origins: ["https://lms.example"],
      })
      .select("id")
      .single();
    licenceId = l!.id;
    await svc.from("content_licence_courses").insert([
      { licence_id: licenceId, course_id: scormCourse },
      { licence_id: licenceId, course_id: otherScormCourse },
    ]);
    const { data: d } = await svc
      .from("content_dispatches")
      .insert([
        { licence_id: licenceId, course_id: scormCourse },
        { licence_id: licenceId, course_id: otherScormCourse },
      ])
      .select("public_id, course_id");
    dispatchA = d!.find((x) => x.course_id === scormCourse)!.public_id;
    dispatchB = d!.find((x) => x.course_id === otherScormCourse)!.public_id;
  }, 200_000);

  afterAll(async () => {
    if (clientIds.length) await svc.from("content_clients").delete().in("id", clientIds);
    await cleanup(svc, { courseIds, userIds });
  }, 120_000);

  it("lists only published courses with a SCORM 1.2 lesson, and only to managers", async () => {
    const { data } = await admin.rpc("content_dispatchable_courses", { p_q: tag });
    const ids = (data as { course_id: string }[]).map((r) => r.course_id);
    expect(ids).toContain(scormCourse);
    expect(ids).not.toContain(scorm2004Course);
    expect(ids).not.toContain(plainCourse);
    const { error } = await support.rpc("content_dispatchable_courses", { p_q: tag });
    expect(error).not.toBeNull();
    expect(
      (await admin.rpc("content_course_is_dispatchable", { p_course_id: plainCourse })).data,
    ).toBe(false);
    expect(
      (await support.rpc("content_course_is_dispatchable", { p_course_id: scormCourse })).data,
    ).toBe(false);
  });

  it("is not callable by signed-in users, only the server", async () => {
    const { error } = await admin.rpc("register_content_launch", {
      p_public_id: dispatchA,
      p_learner_key: key(1),
    });
    expect(error).not.toBeNull();
  });

  it("registers learners, counts a learner once across the licence's courses, and enforces the seat limit", async () => {
    const first = await launch(dispatchA, 1);
    expect(first.status).toBe("ok");
    expect(first.lesson_id).toBeTruthy();
    expect((await launch(dispatchA, 1)).registration_id).toBe(first.registration_id); // relaunch, same seat
    expect((await launch(dispatchB, 1)).status).toBe("ok"); // same learner, other course: no new seat
    expect((await launch(dispatchA, 2)).status).toBe("ok"); // second seat
    expect((await launch(dispatchA, 3)).status).toBe("seat_limit"); // licence full
    expect((await launch(dispatchB, 2)).status).toBe("ok"); // existing learner still gets in
    const { data: seats } = await admin.rpc("content_licence_seats_used", {
      p_licence_id: licenceId,
    });
    expect(seats).toBe(2);
  });

  it("refuses unknown dispatches and malformed learner keys", async () => {
    expect((await launch("f".repeat(32), 1)).status).toBe("not_found");
    const { data } = await svc.rpc("register_content_launch", {
      p_public_id: dispatchA,
      p_learner_key: "learner@example.com",
    });
    expect((data as { status: string }).status).toBe("not_found");
  });

  it("reports usage per licence, course and month to managers only", async () => {
    const { data, error } = await admin.rpc("content_client_usage", { p_client_id: clientId });
    expect(error).toBeNull();
    const rows = data as {
      course_id: string;
      new_learners: number;
      active_learners: number;
      launches: number;
    }[];
    const a = rows.find((r) => r.course_id === scormCourse)!;
    expect(a).toMatchObject({ new_learners: 2, active_learners: 2, launches: 3 });
    const b = rows.find((r) => r.course_id === otherScormCourse)!;
    expect(b).toMatchObject({ new_learners: 2, active_learners: 2, launches: 2 });
    expect(
      (await support.rpc("content_client_usage", { p_client_id: clientId })).error,
    ).not.toBeNull();
  });

  it("stops launches and content as soon as a licence is revoked or expires", async () => {
    const { data: reg } = await svc
      .from("content_registrations")
      .select("id")
      .eq("licence_id", licenceId)
      .limit(1)
      .single();
    expect(
      (
        (await svc.rpc("content_registration_active", { p_registration_id: reg!.id })).data as {
          active: boolean;
        }
      ).active,
    ).toBe(true);

    await svc
      .from("content_licences")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", licenceId);
    expect((await launch(dispatchA, 1)).status).toBe("revoked");
    expect(
      (
        (await svc.rpc("content_registration_active", { p_registration_id: reg!.id })).data as {
          active: boolean;
        }
      ).active,
    ).toBe(false);

    await svc
      .from("content_licences")
      .update({ revoked_at: null, expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", licenceId);
    expect((await launch(dispatchA, 1)).status).toBe("expired");
    expect(
      (
        (await svc.rpc("content_registration_active", { p_registration_id: reg!.id })).data as {
          active: boolean;
        }
      ).active,
    ).toBe(false);

    await svc.from("content_licences").update({ expires_at: null }).eq("id", licenceId);
    expect((await launch(dispatchA, 1)).status).toBe("ok");
  });

  it("refuses a course that lost its SCORM 1.2 lesson", async () => {
    await svc
      .from("lessons")
      .delete()
      .eq("type", "scorm")
      .in(
        "section_id",
        (
          await svc
            .from("course_sections")
            .select("id")
            .eq("title", "SCORM")
            .in(
              "version_id",
              (
                await svc.from("courses").select("published_version_id").eq("id", otherScormCourse)
              ).data!.map((c) => c.published_version_id),
            )
        ).data!.map((s) => s.id),
      );
    expect((await launch(dispatchB, 1)).status).toBe("unavailable");
  });
});
