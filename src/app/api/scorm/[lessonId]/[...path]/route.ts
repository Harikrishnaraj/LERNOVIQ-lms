import { NextResponse, type NextRequest } from "next/server";
import { seedCmi } from "@/services/scorm/cmi";
import { buildScormShim, injectShim } from "@/services/scorm/shim";
import { SCORM_BUCKET, supabaseStorage } from "@/services/storage";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ lessonId: string; path: string[] }> }) {
  const { lessonId, path: pathSegments } = await params;
  if (!UUID.test(lessonId) || pathSegments.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }
  const requestedPath = pathSegments.join("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: allowed } = await supabase.rpc("can_access_lesson_content", { p_lesson_id: lessonId });
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const { data: pkg } = await supabase
    .from("scorm_packages")
    .select("version, launch_path, storage_prefix, file_paths")
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (!pkg) return new NextResponse("Not found", { status: 404 });

  const filePaths = (pkg.file_paths as string[]) ?? [];
  if (!filePaths.includes(requestedPath)) return new NextResponse("Not found", { status: 404 });

  let file: { bytes: Uint8Array; contentType: string };
  try {
    file = await supabaseStorage.download(SCORM_BUCKET, `${pkg.storage_prefix as string}/${requestedPath}`);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const isLaunchFile = requestedPath === pkg.launch_path;
  const isHtml = file.contentType.includes("html");

  if (isLaunchFile && isHtml) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("user_id", user.id)
      .neq("status", "cancelled")
      .maybeSingle();
    const { data: registration } = enrollment
      ? await supabase
          .from("scorm_registrations")
          .select("cmi")
          .eq("lesson_id", lessonId)
          .eq("enrollment_id", enrollment.id)
          .maybeSingle()
      : { data: null };

    const savedCmi = (registration?.cmi as Record<string, string> | null) ?? {};
    const seed = seedCmi({
      version: pkg.version as "1.2" | "2004",
      learnerName: user.email?.split("@")[0] ?? "Learner",
      learnerId: user.id,
      resume: Boolean(registration),
      savedCmi,
    });
    const shim = buildScormShim({ version: pkg.version as "1.2" | "2004", seedCmi: seed });
    const html = injectShim(new TextDecoder().decode(file.bytes), shim);
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }

  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

