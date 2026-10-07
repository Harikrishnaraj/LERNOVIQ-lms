// The guided course-creation flow (ADR-008 / F-202). `built` flips to true as each task ships its
// screen, so the step bar never links to a page that does not exist yet.

export type CourseStepId =
  | "basics"
  | "curriculum"
  | "pricing"
  | "preview"
  | "readiness"
  | "submit";

export interface CourseStep {
  id: CourseStepId;
  label: string;
  /** TASKS.md ID that builds the screen. */
  task: string;
  built: boolean;
  href: (courseId: string) => string;
}

export const COURSE_STEPS: readonly CourseStep[] = [
  { id: "basics", label: "Basics", task: "T-051", built: true, href: (id) => `/instructor/courses/${id}/basics` },
  { id: "curriculum", label: "Curriculum", task: "T-052", built: true, href: (id) => `/instructor/courses/${id}/curriculum` },
  { id: "pricing", label: "Settings", task: "T-055", built: true, href: (id) => `/instructor/courses/${id}/pricing` },
  { id: "preview", label: "Preview", task: "T-056", built: true, href: (id) => `/instructor/courses/${id}/preview` },
  { id: "readiness", label: "Readiness", task: "T-057", built: true, href: (id) => `/instructor/courses/${id}/readiness` },
  { id: "submit", label: "Submit", task: "T-058", built: true, href: (id) => `/instructor/courses/${id}/submit` },
];

/** The next step after `current` whose screen exists, or null. */
export function nextBuiltStep(current: CourseStepId): CourseStep | null {
  const i = COURSE_STEPS.findIndex((s) => s.id === current);
  return COURSE_STEPS.slice(i + 1).find((s) => s.built) ?? null;
}
