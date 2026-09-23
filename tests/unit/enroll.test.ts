import { beforeEach, describe, expect, it, vi } from "vitest";
import { enrollInCourse } from "@/features/enrollment/enroll";

const { getUserMock, insertMock, canMock, detailMock, revalidateMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  insertMock: vi.fn(),
  canMock: vi.fn(),
  detailMock: vi.fn(),
  revalidateMock: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({ insert: insertMock })),
  })),
}));
vi.mock("@/lib/permissions/can", () => ({ can: canMock }));
vi.mock("@/features/catalog/course-detail", () => ({ getCourseDetail: detailMock }));

const freeCourse = { id: "c1", slug: "free-course", versionId: "v1", priceCents: 0 };

describe("enrollInCourse", () => {
  beforeEach(() => {
    for (const m of [getUserMock, insertMock, canMock, detailMock, revalidateMock]) m.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    canMock.mockResolvedValue(true);
    detailMock.mockResolvedValue(freeCourse);
    insertMock.mockResolvedValue({ error: null });
  });

  it("enrolls the signed-in user in a free published course at its live version", async () => {
    expect(await enrollInCourse("free-course")).toEqual({ enrolled: true });
    expect(insertMock).toHaveBeenCalledWith({ user_id: "u1", course_id: "c1", version_id: "v1" });
    expect(revalidateMock).toHaveBeenCalledWith("/courses/free-course");
  });

  it("requires a signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    expect(await enrollInCourse("free-course")).toEqual({ error: "Please log in to enroll." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses users without learner access", async () => {
    canMock.mockResolvedValue(false);
    expect(await enrollInCourse("free-course")).toEqual({
      error: "Your account cannot enroll in courses.",
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses an unknown or unpublished course", async () => {
    detailMock.mockResolvedValue(null);
    expect(await enrollInCourse("nope")).toEqual({ error: "This course is not available." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("refuses a paid course without writing an enrollment", async () => {
    detailMock.mockResolvedValue({ ...freeCourse, priceCents: 4900 });
    const result = await enrollInCourse("free-course");
    expect(result).toEqual({
      error: "This course requires payment, and checkout is not available yet.",
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("treats an existing enrollment as success", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });
    expect(await enrollInCourse("free-course")).toEqual({ enrolled: true });
  });

  it("returns a safe error on other database failures", async () => {
    insertMock.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    expect(await enrollInCourse("free-course")).toEqual({
      error: "We could not enroll you. Please try again.",
    });
  });
});
