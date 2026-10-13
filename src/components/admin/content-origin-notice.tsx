/** Shown when no separate content address is configured, so dispatch packages cannot be built (ADR-041). */
export function ContentOriginNotice() {
  return (
    <p
      role="note"
      className="mb-4 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text"
    >
      Packages cannot be downloaded yet: the content server needs a separate content address
      (NEXT_PUBLIC_SCORM_CONTENT_ORIGIN, a different host from the app). You can still set up
      customers and licences.
    </p>
  );
}
