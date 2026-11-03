// A send or an answer Core took can still say that something after it went
// wrong, in a `problem` string on the value. The chat shows it (`state.notice`);
// a value without one, or of another shape, says nothing.

/** The `problem` sentence of `value`, if it has a non-empty one. */
export function problemOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const problem = (value as { problem?: unknown }).problem;
  return typeof problem === "string" && problem.trim() !== "" ? problem : undefined;
}
