import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EnrollButton } from "@/components/courses/enroll-button";
import { enrollInCourse } from "@/features/enrollment/enroll";
import { isEnrolled } from "@/features/enrollment/status";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

/** Call-to-action for the course page: log in / enroll / go to course, by viewer state. */
export async function EnrollmentPanel({
  courseId,
  slug,
  priceCents,
}: {
  courseId: string;
  slug: string;
  priceCents: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/courses/${slug}`)}`}
        className={buttonClasses({ size: "lg", className: "w-full" })}
      >
        Log in to enroll
      </Link>
    );
  }

  // Instructors/admins browsing the catalog have no learner portal to enroll into.
  if (!(await can(supabase, user.id, "portal.learner.access"))) return null;

  if (await isEnrolled(supabase, user.id, courseId)) {
    return (
      <div className="space-y-3">
        <p role="status" className="text-sm font-medium text-success-text">
          You are enrolled in this course.
        </p>
        <Link
          href="/learner/my-learning"
          className={buttonClasses({ size: "lg", className: "w-full" })}
        >
          Go to My Learning
        </Link>
      </div>
    );
  }

  if (priceCents > 0) {
    return (
      <p className="text-sm text-text-secondary">
        Paid enrollment is not available yet. Checkout is coming soon.
      </p>
    );
  }

  return <EnrollButton onEnroll={enrollInCourse.bind(null, slug)} />;
}
