/** "just now", "3 min ago", "2 h ago", "4 d ago": how long ago, in the unit a person thinks in. */
export function agoText(then: number | undefined, now: number): string {
  if (typeof then !== "number" || !Number.isFinite(then)) return "not known";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
