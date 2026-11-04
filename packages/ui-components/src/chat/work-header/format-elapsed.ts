// How long the work has run, in a person's words: "12s", "1m 12s", "1h 05m".
// Seconds never go backwards and never show a negative or fractional number. No DOM.

/** `ms` of elapsed time as "12s", "1m 12s" or "1h 05m". */
export function formatElapsed(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}
