/** Puts back a map entry as it was before a failed write: the value, or no entry when there was none. */
export function restoreEntry<T>(entries: Map<string, T>, id: string, value: T | undefined): void {
  if (value === undefined) entries.delete(id);
  else entries.set(id, value);
}
