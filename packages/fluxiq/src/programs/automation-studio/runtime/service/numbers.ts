// Numeric coercion shared by every paged reader: a limit or an offset
// arrives from a caller as unknown and has to land inside a known range.
export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}
