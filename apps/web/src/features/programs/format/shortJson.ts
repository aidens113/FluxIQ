const LIMIT = 90;

function plain(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length === 1 ? "1 item" : `${value.length} items`;
  return "details";
}

/**
 * A value in words for a table cell, never as raw JSON: an object reads "name: value, other: value", a list as a count.
 * Cut to 90 characters. "-" when there is nothing to say.
 */
export function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>).map(([key, entry]) => `${key}: ${plain(entry)}`).join(", ")
    : plain(value);
  if (!text) return "-";
  return text.length > LIMIT ? `${text.slice(0, LIMIT)}…` : text;
}
