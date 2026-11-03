// Reading a usable scalar out of values the service stores as JSON. The
// recording state index, the flow settings projections and the runtime
// adaptation context all take the first candidate that is actually there.

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export function firstFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}
