import type { SupabaseClient } from "@supabase/supabase-js";
import { csvCell } from "@/features/admin/audit";
import { licenceStatus, type LicenceStatus } from "./rules";

// Reads for the admin Content Server screens (T-171, F-520). RLS limits every table to
// `content_server.manage`; callers check the permission first to show a permission-denied state.

export interface ContentClientSummary {
  id: string;
  name: string;
  contactEmail: string | null;
  licenceCount: number;
  activeLicenceCount: number;
}

export interface LicenceCourse {
  courseId: string;
  title: string;
  slug: string;
}

export interface ContentLicenceView {
  id: string;
  name: string;
  seatLimit: number | null;
  seatsUsed: number;
  expiresAt: string | null;
  allowedOrigins: string[];
  revokedAt: string | null;
  status: LicenceStatus;
  courses: LicenceCourse[];
}

export interface ContentClientDetail {
  id: string;
  name: string;
  contactEmail: string | null;
  notes: string | null;
  createdAt: string;
  licences: ContentLicenceView[];
}

export interface DispatchableCourse {
  courseId: string;
  title: string;
  slug: string;
  lessonTitle: string;
}

type LicenceRow = {
  id: string;
  client_id: string;
  name: string;
  seat_limit: number | null;
  expires_at: string | null;
  allowed_origins: string[];
  revoked_at: string | null;
};

export async function listContentClients(
  supabase: SupabaseClient,
  now = new Date(),
): Promise<ContentClientSummary[]> {
  const [{ data: clients, error }, { data: licences, error: lerr }] = await Promise.all([
    supabase.from("content_clients").select("id, name, contact_email").order("name"),
    supabase.from("content_licences").select("id, client_id, revoked_at, expires_at"),
  ]);
  if (error) throw new Error(`listContentClients failed: ${error.message}`);
  if (lerr) throw new Error(`listContentClients licences failed: ${lerr.message}`);
  return (clients ?? []).map((c) => {
    const own = (licences ?? []).filter((l) => l.client_id === c.id);
    return {
      id: c.id as string,
      name: c.name as string,
      contactEmail: (c.contact_email as string | null) ?? null,
      licenceCount: own.length,
      activeLicenceCount: own.filter(
        (l) =>
          licenceStatus(
            { revokedAt: l.revoked_at as string | null, expiresAt: l.expires_at as string | null },
            now,
          ) === "active",
      ).length,
    };
  });
}

async function courseTitles(
  supabase: SupabaseClient,
  courseIds: string[],
): Promise<Map<string, { title: string; slug: string }>> {
  const out = new Map<string, { title: string; slug: string }>();
  if (courseIds.length === 0) return out;
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, slug, published_version_id")
    .in("id", courseIds);
  if (error) throw new Error(`courseTitles failed: ${error.message}`);
  const versionIds = (courses ?? [])
    .map((c) => c.published_version_id as string | null)
    .filter((v): v is string => Boolean(v));
  const { data: versions } = versionIds.length
    ? await supabase.from("course_versions").select("id, title").in("id", versionIds)
    : { data: [] as { id: string; title: string }[] };
  const titleById = new Map((versions ?? []).map((v) => [v.id as string, v.title as string]));
  for (const c of courses ?? []) {
    const slug = c.slug as string;
    out.set(c.id as string, {
      slug,
      title: titleById.get(c.published_version_id as string) ?? slug,
    });
  }
  return out;
}

export async function getContentClient(
  supabase: SupabaseClient,
  clientId: string,
  now = new Date(),
): Promise<ContentClientDetail | null> {
  const { data: client, error } = await supabase
    .from("content_clients")
    .select("id, name, contact_email, notes, created_at")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(`getContentClient failed: ${error.message}`);
  if (!client) return null;

  const { data: licenceRows, error: lerr } = await supabase
    .from("content_licences")
    .select("id, client_id, name, seat_limit, expires_at, allowed_origins, revoked_at")
    .eq("client_id", clientId)
    .order("created_at");
  if (lerr) throw new Error(`getContentClient licences failed: ${lerr.message}`);
  const licences = (licenceRows ?? []) as LicenceRow[];
  const licenceIds = licences.map((l) => l.id);

  const { data: links, error: cerr } = licenceIds.length
    ? await supabase
        .from("content_licence_courses")
        .select("licence_id, course_id, added_at")
        .in("licence_id", licenceIds)
        .order("added_at")
    : { data: [] as { licence_id: string; course_id: string }[], error: null };
  if (cerr) throw new Error(`getContentClient courses failed: ${cerr.message}`);
  const titles = await courseTitles(supabase, [
    ...new Set((links ?? []).map((l) => l.course_id as string)),
  ]);

  const seats = await Promise.all(
    licences.map(async (l) => {
      const { data } = await supabase.rpc("content_licence_seats_used", { p_licence_id: l.id });
      return typeof data === "number" ? data : 0;
    }),
  );

  return {
    id: client.id as string,
    name: client.name as string,
    contactEmail: (client.contact_email as string | null) ?? null,
    notes: (client.notes as string | null) ?? null,
    createdAt: client.created_at as string,
    licences: licences.map((l, i) => ({
      id: l.id,
      name: l.name,
      seatLimit: l.seat_limit,
      seatsUsed: seats[i],
      expiresAt: l.expires_at,
      allowedOrigins: l.allowed_origins ?? [],
      revokedAt: l.revoked_at,
      status: licenceStatus({ revokedAt: l.revoked_at, expiresAt: l.expires_at }, now),
      courses: (links ?? [])
        .filter((k) => k.licence_id === l.id)
        .map((k) => {
          const t = titles.get(k.course_id as string);
          return {
            courseId: k.course_id as string,
            title: t?.title ?? "Unknown course",
            slug: t?.slug ?? "",
          };
        }),
    })),
  };
}

export async function searchDispatchableCourses(
  supabase: SupabaseClient,
  q: string,
): Promise<DispatchableCourse[]> {
  const { data, error } = await supabase.rpc("content_dispatchable_courses", {
    p_q: q.slice(0, 100),
  });
  if (error) throw new Error(`searchDispatchableCourses failed: ${error.message}`);
  return (
    (data ?? []) as { course_id: string; title: string; slug: string; lesson_title: string }[]
  ).map((r) => ({
    courseId: r.course_id,
    title: r.title,
    slug: r.slug,
    lessonTitle: r.lesson_title,
  }));
}

export interface UsageRow {
  licenceId: string;
  licenceName: string;
  courseId: string;
  courseTitle: string;
  month: string; // YYYY-MM-01
  newLearners: number;
  activeLearners: number;
  launches: number;
}

/** T-176: registrations and launches per licence, course and month for one client. */
export async function getClientUsage(
  supabase: SupabaseClient,
  clientId: string,
): Promise<UsageRow[]> {
  const { data, error } = await supabase.rpc("content_client_usage", { p_client_id: clientId });
  if (error) throw new Error(`getClientUsage failed: ${error.message}`);
  return (
    (data ?? []) as {
      licence_id: string;
      licence_name: string;
      course_id: string;
      course_title: string;
      month: string;
      new_learners: number;
      active_learners: number;
      launches: number;
    }[]
  ).map((r) => ({
    licenceId: r.licence_id,
    licenceName: r.licence_name,
    courseId: r.course_id,
    courseTitle: r.course_title,
    month: r.month,
    newLearners: r.new_learners,
    activeLearners: r.active_learners,
    launches: r.launches,
  }));
}

/** CSV for the usage report (T-176). Values are quoted and formula-safe. */
export function usageToCsv(clientName: string, rows: UsageRow[]): string {
  const cell = csvCell;
  const header = [
    "client",
    "licence",
    "course",
    "month",
    "new_learners",
    "active_learners",
    "launches",
  ];
  const lines = rows.map((r) =>
    [
      clientName,
      r.licenceName,
      r.courseTitle,
      r.month.slice(0, 7),
      r.newLearners,
      r.activeLearners,
      r.launches,
    ]
      .map(cell)
      .join(","),
  );
  return [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
}
