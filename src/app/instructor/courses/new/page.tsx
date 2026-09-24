import type { Metadata } from "next";
import { BasicsForm } from "@/components/course-authoring/basics-form";
import { CourseSteps } from "@/components/course-authoring/course-steps";
import { PageHeader } from "@/components/layout/page-header";
import { listCategories } from "@/features/catalog/search-courses";
import { createCourseAction } from "@/features/course-authoring/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create course" };

export default async function NewCoursePage() {
  const categories = await listCategories(await createClient());
  return (
    <>
      <PageHeader title="Create a course" description="Step 1 of the guided setup: the basics." />
      <CourseSteps courseId={null} current="basics" />
      <BasicsForm
        mode="create"
        categories={categories}
        initial={{ title: "", subtitle: "", categorySlug: "", description: "", outcomes: "", requirements: "", level: "beginner", language: "en", thumbnailUrl: null }}
        onSubmit={createCourseAction}
        createdRedirectTemplate="/instructor/courses/{id}/basics"
      />
    </>
  );
}
