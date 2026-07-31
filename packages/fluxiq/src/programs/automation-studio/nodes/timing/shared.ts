import { numberValue } from "../shared/definition";

export function durationMs(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(numberValue(value, fallback)));
}

export function durationFromUnit(value: unknown, unit: unknown, fallbackMs: number): number {
  const amount = numberValue(value, fallbackMs);
  if (unit === "seconds") return durationMs(amount * 1000, fallbackMs);
  if (unit === "minutes") return durationMs(amount * 60000, fallbackMs);
  return durationMs(amount, fallbackMs);
}
