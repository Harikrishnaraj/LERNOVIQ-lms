import { describe, expect, it } from "vitest";
import { REQUEST_KINDS, slaState } from "@/features/privacy/requests";

// F-444 (T-286): the one-month deadline as the queue shows it.
const now = new Date("2026-11-10T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

describe("subject request SLA", () => {
  it("counts days left, flags the last week, and flags late requests", () => {
    expect(slaState(days(20), "open", now)).toMatchObject({ daysLeft: 20, overdue: false, dueSoon: false });
    expect(slaState(days(3), "in_progress", now)).toMatchObject({ daysLeft: 3, overdue: false, dueSoon: true });
    expect(slaState(days(-2), "open", now)).toMatchObject({ daysLeft: -2, overdue: true, dueSoon: false });
  });

  it("never flags a finished request", () => {
    expect(slaState(days(-30), "completed", now).overdue).toBe(false);
    expect(slaState(days(-30), "rejected", now).overdue).toBe(false);
  });

  it("offers every right the feature names", () => {
    expect(Object.keys(REQUEST_KINDS).sort()).toEqual(["access", "erasure", "objection", "portability", "rectification", "restriction"]);
  });
});
