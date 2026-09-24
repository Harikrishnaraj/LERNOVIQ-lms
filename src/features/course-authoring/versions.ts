// Which version of a course an instructor is allowed to edit (pure).

export interface VersionInfo {
  id: string;
  versionNumber: number;
  status: string;
}

/** Content can only change while a version is a draft or has changes requested. */
export const EDITABLE_STATUSES = ["draft", "changes_requested"] as const;

export const isEditableStatus = (status: string) =>
  (EDITABLE_STATUSES as readonly string[]).includes(status);

/**
 * The version being worked on: the newest one. Returns null when that version is locked
 * (submitted, in review, approved, published, archived, rejected) so nothing can be edited.
 */
export function pickEditableVersion(versions: VersionInfo[]): VersionInfo | null {
  const latest = [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
  return latest && isEditableStatus(latest.status) ? latest : null;
}
