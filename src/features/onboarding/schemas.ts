import { z } from "zod";
import { GOAL_OPTIONS, INTEREST_OPTIONS } from "./options";

const interestValues = INTEREST_OPTIONS.map((o) => o.value) as [string, ...string[]];
const goalValues = GOAL_OPTIONS.map((o) => o.value) as [string, ...string[]];

export const onboardingSchema = z.object({
  interests: z.array(z.enum(interestValues)).min(1, "Pick at least one interest."),
  goals: z.array(z.enum(goalValues)),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
