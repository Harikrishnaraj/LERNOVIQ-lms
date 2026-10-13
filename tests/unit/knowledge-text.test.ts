// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  approxTokens,
  breadcrumb,
  chunkParagraphs,
  htmlToParagraphs,
  sha256,
} from "@/features/knowledge/text";

// F-800 (T-221): lesson text extraction and chunking.

describe("htmlToParagraphs", () => {
  it("turns block elements into paragraphs and keeps headings, lists and table cells", () => {
    const html =
      "<h2>Closures</h2><p>A closure <strong>captures</strong> variables.</p>" +
      "<ul><li>First point</li><li>Second &amp; last</li></ul>" +
      "<table><tr><th>Term</th><td>Meaning</td></tr></table><p>Line one<br>Line two</p>";
    expect(htmlToParagraphs(html)).toEqual([
      "Closures",
      "A closure captures variables.",
      "• First point",
      "• Second & last",
      "Term | Meaning |",
      "Line one\nLine two",
    ]);
  });

  it("decodes entities, collapses whitespace and drops empty blocks", () => {
    expect(
      htmlToParagraphs("<p>  a&nbsp;&nbsp;b &lt;tag&gt; &#8217;s &#x2014; </p><p> </p><hr>"),
    ).toEqual(["a b <tag> ’s —"]);
  });

  it("drops script and style content if any slipped through", () => {
    expect(htmlToParagraphs("<p>ok</p><script>alert(1)</script><style>p{}</style>")).toEqual([
      "ok",
    ]);
  });

  it("returns nothing for an empty lesson", () => {
    expect(htmlToParagraphs("")).toEqual([]);
  });
});

describe("chunkParagraphs", () => {
  const crumb = breadcrumb("JavaScript Basics", "Functions", "Closures");

  it("prefixes every chunk with the breadcrumb", () => {
    const chunks = chunkParagraphs(["A closure captures variables."], crumb);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      position: 0,
      content: "JavaScript Basics › Functions › Closures\n\nA closure captures variables.",
    });
    expect(chunks[0].contentHash).toBe(sha256(chunks[0].content));
  });

  it("splits long lessons into ~target-sized chunks that overlap", () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ` + "word ".repeat(40));
    const chunks = chunkParagraphs(paragraphs, crumb, { targetTokens: 200, overlapTokens: 60 });

    expect(chunks.length).toBeGreaterThan(3);
    chunks.forEach((c, i) => expect(c.position).toBe(i));
    for (const c of chunks)
      expect(c.tokenCount).toBeLessThanOrEqual(200 + approxTokens(crumb) + 60);
    // The last paragraph of one chunk opens the next one.
    for (let i = 1; i < chunks.length; i++) {
      const prevBody = chunks[i - 1].content.split("\n\n").slice(1);
      const nextBody = chunks[i].content.split("\n\n").slice(1);
      expect(nextBody[0]).toBe(prevBody[prevBody.length - 1]);
    }
    // Every paragraph appears somewhere.
    const all = chunks.map((c) => c.content).join("\n");
    for (const p of paragraphs) expect(all).toContain(p);
  });

  it("breaks a single over-long paragraph at sentence boundaries, never over the size limit", () => {
    const long = Array.from(
      { length: 120 },
      (_, i) => `Sentence number ${i} explains something.`,
    ).join(" ");
    const chunks = chunkParagraphs([long], crumb, { targetTokens: 100, overlapTokens: 0 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(c.content.length).toBeLessThan(8000);
      expect(c.content.split("\n\n")[1]).toMatch(/\.$/);
    }
  });

  it("produces no chunks for a lesson without text", () => {
    expect(chunkParagraphs([], crumb)).toEqual([]);
  });

  it("is deterministic, so unchanged lessons hash the same", () => {
    const a = chunkParagraphs(["One.", "Two."], crumb);
    const b = chunkParagraphs(["One.", "Two."], crumb);
    expect(a).toEqual(b);
  });
});

describe("breadcrumb", () => {
  it("joins the non-empty parts", () => {
    expect(breadcrumb("Course", " ", null, "Lesson")).toBe("Course › Lesson");
  });
});
