export function stateLayerImageSrc(contentRef: string): string {
  if (contentRef.startsWith("/api/")) return contentRef;
  const match = /^automation-object:\/\/project\/([^/]+)\/([a-f0-9]{64})$/i.exec(contentRef.trim());
  return match ? `/api/programs/automation-studio/state-assets/${encodeURIComponent(decodeURIComponent(match[1]!))}/${match[2]!.toLowerCase()}` : "";
}

export function boundedStateItems<T>(items: readonly T[], prioritized: (item: T) => boolean, limit: number): T[] {
  if (items.length <= limit) return [...items];
  const priority = items.filter(prioritized);
  const prioritySet = new Set(priority);
  return [...priority, ...items.filter((item) => !prioritySet.has(item))].slice(0, limit);
}
