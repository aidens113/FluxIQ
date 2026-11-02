/** A judgment value, or the precise reason the bounded wait ended. */
export type ResultVerificationBounded<TValue> =
  | { settled: true; value: TValue }
  | { settled: false; reason: "timed_out" | "aborted" | "threw"; error?: unknown };
