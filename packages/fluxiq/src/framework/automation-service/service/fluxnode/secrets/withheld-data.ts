/** Data (a result's outputs, a record, an event's inputs) with every text, keys too, passed through `text`, to any depth. */
export function withheldData(value: unknown, text: (text: string) => string, depth: number): unknown {
  if (typeof value === "string") return text(value);
  if (!value || typeof value !== "object" || depth > 64) return value;
  if (Array.isArray(value)) return value.map((item) => withheldData(item, text, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [text(key), withheldData(item, text, depth + 1)]));
}
