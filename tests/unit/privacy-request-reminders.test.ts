import { describe, expect, it } from "vitest";
import { reminderStage, sendRequestReminders } from "@/features/privacy/request-reminders";

// F-449 (T-297): one reminder 7 days before the deadline, one once it has passed, never repeated.
const now = new Date("2026-11-04T12:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
const base = { status: "open" as const, reminded_due_soon_at: null, reminded_overdue_at: null };

describe("reminderStage", () => {
  it("is quiet while the deadline is more than 7 days away", () => {
    expect(reminderStage({ ...base, due_at: at(10) }, now)).toBeNull();
  });
  it("reminds once inside the last 7 days", () => {
    expect(reminderStage({ ...base, due_at: at(5) }, now)).toBe("due_soon");
    expect(reminderStage({ ...base, due_at: at(5), reminded_due_soon_at: at(-1) }, now)).toBeNull();
  });
  it("reminds once when overdue, even after a due-soon reminder", () => {
    expect(reminderStage({ ...base, due_at: at(-2), reminded_due_soon_at: at(-9) }, now)).toBe("overdue");
    expect(reminderStage({ ...base, due_at: at(-2), reminded_overdue_at: at(-1) }, now)).toBeNull();
  });
  it("never reminds about a finished request", () => {
    expect(reminderStage({ ...base, status: "completed", due_at: at(-2) }, now)).toBeNull();
  });
});

describe("sendRequestReminders", () => {
  // Minimal fake: returns canned rows per table and records updates.
  function admin(staff: string[], updates: unknown[]) {
    const rows: Record<string, unknown[]> = {
      subject_requests: [{ id: "r1", kind: "access", ...base, due_at: at(-1) }],
      role_permissions: [{ role_id: "admin" }],
      user_roles: staff.map((user_id) => ({ user_id })),
    };
    return {
      from(table: string) {
        const q = {
          select: () => q,
          eq: () => q,
          in: () => q,
          update: (v: unknown) => (updates.push(v), q),
          then: (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(ok),
        };
        return q;
      },
    } as never;
  }

  it("notifies staff and stamps the request", async () => {
    const updates: unknown[] = [];
    const told: string[] = [];
    const out = await sendRequestReminders(admin(["s1", "s2"], updates), async (n) => (told.push(n.userId), true), now);
    expect(out).toEqual({ reminded: 1 });
    expect(told).toEqual(["s1", "s2"]);
    expect(updates).toHaveLength(1);
  });

  it("does not stamp when nobody could be told", async () => {
    const none: unknown[] = [];
    expect(await sendRequestReminders(admin([], none), async () => true, now)).toEqual({ reminded: 0 });
    const failed: unknown[] = [];
    expect(await sendRequestReminders(admin(["s1"], failed), async () => false, now)).toEqual({ reminded: 0 });
    expect([...none, ...failed]).toHaveLength(0);
  });
});
