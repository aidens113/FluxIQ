/** A timestamp in milliseconds as local date and time, or "-" when there is none. */
export function formatTime(value: unknown): string {
  return typeof value === "number" && value > 0 ? new Date(value).toLocaleString() : "-";
}
