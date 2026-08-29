export function formatClientTime(value: unknown): string {
  return typeof value === "number" ? new Date(value).toLocaleString() : "-";
}