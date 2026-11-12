export function reconcileVisibleSelection<T>(items: readonly T[], selectedId: string, idOf: (item: T) => string): string {
  if (selectedId && items.some((item) => idOf(item) === selectedId)) return selectedId;
  return items[0] ? idOf(items[0]) : "";
}
