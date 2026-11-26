import { beforeEach, describe, expect, it, vi } from "vitest";

// Deleting an assignment RLS hides (another organisation's, or already gone) deletes nothing and
// returns no error: it must not report success or write an 'unassigned' audit row (report audit C23, C45).

let deletedRows: { id: string }[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@example.test" } } }) },
    from: () => ({ delete: () => ({ eq: () => ({ select: async () => ({ data: deletedRows, error: null }) }) }) }),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/catalog/search-courses", () => ({ searchCourses: vi.fn() }));
const recordAudit = vi.fn<(entry: unknown) => Promise<boolean>>(async () => true);
vi.mock("@/services/audit", () => ({ recordAudit: (entry: unknown) => recordAudit(entry) }));

import { deleteAssignedLearningAction } from "@/features/admin/assigned-learning-actions";

describe("deleteAssignedLearningAction", () => {
  beforeEach(() => {
    recordAudit.mockClear();
  });

  it("does not report success or audit when no row was deleted", async () => {
    deletedRows = [];
    expect(await deleteAssignedLearningAction("a1", "/org_admin")).toEqual({ ok: false, error: "That assignment is not available." });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("audits and reports success when the row was deleted", async () => {
    deletedRows = [{ id: "a1" }];
    expect(await deleteAssignedLearningAction("a1", "/org_admin")).toEqual({ ok: true });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "organization.learning_unassigned", resourceId: "a1" }));
  });
});
