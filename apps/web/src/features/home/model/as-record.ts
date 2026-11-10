/** The value as a plain object, or undefined: reading an answer from the engine never trusts its shape. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
