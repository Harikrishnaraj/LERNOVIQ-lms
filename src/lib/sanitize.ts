import sanitizeHtml from "sanitize-html";

// Allow-list for instructor-authored lesson content (RULES section 6: never render unsanitized
// user HTML). Scripts, event handlers, iframes, styles and javascript: URLs are all dropped.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h2", "h3", "h4", "strong", "em", "u", "s", "code", "pre", "blockquote",
    "ul", "ol", "li", "a", "img", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "title"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  transformTags: {
    // Links from user content must not leak the opener or referrer.
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
  },
};

export function sanitizeLessonHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
