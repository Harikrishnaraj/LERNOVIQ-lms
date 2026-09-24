// Course completion rule (pure, F-109). A learner completes a course when
//   1. every lesson is satisfied, and
//   2. every assessment of the enrolled version has been passed.
// A lesson is satisfied by being marked complete, or - for a quiz lesson linked to an assessment -
// by passing that assessment. An assessment awaiting manual review is not passed.

export interface CompletionLesson {
  id: string;
}

export interface CompletionAssessment {
  id: string;
  lessonId: string | null;
}

export interface CompletionInput {
  lessons: CompletionLesson[];
  completedLessonIds: ReadonlySet<string>;
  assessments: CompletionAssessment[];
  passedAssessmentIds: ReadonlySet<string>;
}

export interface CompletionSummary {
  lessonsTotal: number;
  lessonsDone: number;
  assessmentsTotal: number;
  assessmentsPassed: number;
  complete: boolean;
}

export function summarizeCompletion(input: CompletionInput): CompletionSummary {
  const passedLessonIds = new Set(
    input.assessments
      .filter((a) => a.lessonId !== null && input.passedAssessmentIds.has(a.id))
      .map((a) => a.lessonId as string),
  );
  const lessonsDone = input.lessons.filter(
    (l) => input.completedLessonIds.has(l.id) || passedLessonIds.has(l.id),
  ).length;
  const assessmentsPassed = input.assessments.filter((a) => input.passedAssessmentIds.has(a.id)).length;

  return {
    lessonsTotal: input.lessons.length,
    lessonsDone,
    assessmentsTotal: input.assessments.length,
    assessmentsPassed,
    // A course with no lessons cannot be completed.
    complete:
      input.lessons.length > 0 &&
      lessonsDone === input.lessons.length &&
      assessmentsPassed === input.assessments.length,
  };
}

export const isCourseComplete = (input: CompletionInput) => summarizeCompletion(input).complete;
