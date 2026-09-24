import { describe, expect, it } from "vitest";
import { normalizeCertificateCode } from "@/features/certificates/queries";

describe("normalizeCertificateCode", () => {
  it("uppercases and trims valid codes", () => {
    expect(normalizeCertificateCode("  mlc-9f2a-1c4b-77d0-ab31 ")).toBe("MLC-9F2A-1C4B-77D0-AB31");
  });

  it("rejects anything that cannot be a certificate ID", () => {
    for (const bad of [
      "",
      "MLC-9F2A-1C4B-77D0",
      "XYZ-9F2A-1C4B-77D0-AB31",
      "MLC-9F2A-1C4B-77D0-AB3G",
      "MLC-9F2A-1C4B-77D0-AB31-EXTRA",
      "MLC-9F2A-1C4B-77D0-AB31; drop table certificates",
      "../../etc/passwd",
    ]) {
      expect(normalizeCertificateCode(bad), bad).toBeNull();
    }
  });
});
