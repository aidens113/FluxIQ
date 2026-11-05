/** Deterministic JSON for a digest: object keys sorted, arrays in order, `undefined` left out. */
export function canonicalPartJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPartJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalPartJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
