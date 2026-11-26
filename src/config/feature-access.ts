/**
 * Per-account feature switches for demo accounts (user decision, 2026-10-23): the AI Tutor is hidden
 * from these learner logins. Emails are compared lower-cased. Remove an address to show it again.
 */
export const AI_TUTOR_HREF = "/learner/ai-tutor";

const AI_TUTOR_HIDDEN_EMAILS: ReadonlySet<string> = new Set([
  "ingx.demouser1100@lernoviq.com",
  "demo.nielit1@lernoviq.com",
  "demo.nielit2@lernoviq.com",
  "demo.nielit3@lernoviq.com",
  "demo.nielit4@lernoviq.com",
  "demo.learner1@lernoviq.com",
]);

export function aiTutorHiddenFor(email: string | null | undefined): boolean {
  return !!email && AI_TUTOR_HIDDEN_EMAILS.has(email.toLowerCase());
}
