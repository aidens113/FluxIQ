/** Reads a fixed relative-date reference without changing the live execution clock. */
export function automationStudioReferenceNow(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8_640_000_000_000_000 ? value : undefined;
}
