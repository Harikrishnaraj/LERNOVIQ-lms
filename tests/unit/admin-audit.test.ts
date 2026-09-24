import { describe, expect, it } from "vitest";
import { auditToCsv, csvCell, likePattern, parseAuditQuery } from "@/features/admin/audit";

describe("parseAuditQuery", () => {
  it("defaults, and drops unknown actions and bad dates", () => {
    expect(parseAuditQuery({})).toEqual({ action: "", actor: "", resourceType: "", resourceId: "", from: "", to: "", page: 1 });
    const q = parseAuditQuery({ action: "drop table", from: "2026-13-45x", to: "yesterday", page: "0" });
    expect(q).toMatchObject({ action: "", from: "", to: "", page: 1 });
  });

  it("keeps valid values and trims text", () => {
    const q = parseAuditQuery({ action: "course.approved", actor: "  a@b.co ", resourceType: "course", resourceId: "abc", from: "2026-01-02", to: "2026-02-03", page: "4" });
    expect(q).toEqual({ action: "course.approved", actor: "a@b.co", resourceType: "course", resourceId: "abc", from: "2026-01-02", to: "2026-02-03", page: 4 });
    expect(parseAuditQuery({ actor: "x".repeat(300) }).actor).toHaveLength(100);
  });
});

describe("likePattern", () => {
  it("makes wildcards literal", () => {
    expect(likePattern("ada")).toBe("%ada%");
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("csv", () => {
  it("quotes cells, doubles quotes and serialises objects", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("neutralises spreadsheet formulas", () => {
    for (const bad of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) {
      expect(csvCell(bad)).toBe(`"'${bad}"`);
    }
    expect(csvCell("safe=1")).toBe('"safe=1"');
  });

  it("writes a header and one CRLF-terminated line per row", () => {
    const csv = auditToCsv([
      { id: "1", createdAt: "2026-01-01T00:00:00Z", actorId: "u", actorEmail: "a@b.co", action: "course.approved", resourceType: "course", resourceId: "c1", metadata: { x: 1 } },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"time","actor_email","actor_id","action","resource_type","resource_id","metadata"');
    expect(lines[1]).toBe('"2026-01-01T00:00:00Z","a@b.co","u","course.approved","course","c1","{""x"":1}"');
    expect(lines[2]).toBe("");
    expect(auditToCsv([]).split("\r\n")).toHaveLength(2);
  });
});
