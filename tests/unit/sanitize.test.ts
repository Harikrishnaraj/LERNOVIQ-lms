import { describe, expect, it } from "vitest";
import { sanitizeLessonHtml } from "@/lib/sanitize";

describe("sanitizeLessonHtml", () => {
  it("keeps allowed formatting", () => {
    expect(sanitizeLessonHtml("<p>Hi <strong>there</strong></p><ul><li>x</li></ul>")).toBe(
      "<p>Hi <strong>there</strong></p><ul><li>x</li></ul>",
    );
  });

  it("removes scripts, event handlers, iframes and styles", () => {
    const out = sanitizeLessonHtml(
      '<script>alert(1)</script><p onclick="x()" style="color:red">a</p><iframe src="https://evil"></iframe><img src="https://ok/a.png" onerror="x()">',
    );
    expect(out).not.toMatch(/script|onclick|onerror|iframe|style/i);
    expect(out).toContain("<p>a</p>");
    expect(out).toContain('src="https://ok/a.png"');
  });

  it("blocks javascript: and data: URLs", () => {
    expect(sanitizeLessonHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript/i);
    expect(sanitizeLessonHtml('<img src="data:text/html;base64,AAAA">')).not.toMatch(/data:/i);
  });

  it("hardens external links", () => {
    const out = sanitizeLessonHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it("normalises b and i to strong and em", () => {
    expect(sanitizeLessonHtml("<p><b>bold</b> and <i>italic</i></p>")).toBe(
      "<p><strong>bold</strong> and <em>italic</em></p>",
    );
  });
});
