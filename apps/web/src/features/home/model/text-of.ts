/** A non-empty string, or undefined. */
export function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
