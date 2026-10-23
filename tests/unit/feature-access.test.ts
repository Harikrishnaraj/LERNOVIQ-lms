import { describe, expect, it } from "vitest";
import { aiTutorHiddenFor } from "@/config/feature-access";

describe("aiTutorHiddenFor", () => {
  it("hides the AI Tutor for the demo learner accounts, case-insensitively", () => {
    for (const email of [
      "ingx.demouser1100@lernoviq.com",
      "demo.nielit1@lernoviq.com",
      "Demo.Nielit4@Lernoviq.com",
      "demo.learner1@lernoviq.com",
    ]) {
      expect(aiTutorHiddenFor(email)).toBe(true);
    }
  });

  it("keeps it for everyone else, including the demo admin and instructor", () => {
    for (const email of [
      "ingx.admin@lernoviq.com",
      "ingx.instructor@lernoviq.com",
      "someone@example.com",
      null,
      undefined,
      "",
    ]) {
      expect(aiTutorHiddenFor(email)).toBe(false);
    }
  });
});
