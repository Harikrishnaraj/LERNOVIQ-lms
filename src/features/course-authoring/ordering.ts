// Pure ordering helpers for the curriculum builder (drag & drop and the keyboard/menu alternative).

/** Moves the item at `from` to index `to`. Out-of-range indexes are clamped; returns a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const clamped = Math.max(0, Math.min(items.length - 1, to));
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

/** Moves an id one step up (-1) or down (+1). Unknown ids and edge moves leave the order unchanged. */
export function moveBy(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  return moveItem(ids, from, from + delta);
}

/**
 * A proposed order is only valid if it is exactly a permutation of the current ids: same members,
 * no duplicates, nothing added or dropped. Protects against stale or forged reorder requests.
 */
export function isPermutation(current: readonly string[], proposed: readonly string[]): boolean {
  if (current.length !== proposed.length) return false;
  if (new Set(proposed).size !== proposed.length) return false;
  const set = new Set(current);
  return proposed.every((id) => set.has(id));
}

/** Position for a new item appended after `existing` positions (0-based, gap-free). */
export function nextPosition(existing: readonly number[]): number {
  return existing.length === 0 ? 0 : Math.max(...existing) + 1;
}
