import { numberValue } from "../shared/definition";

export function durationMs(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(numberValue(value, fallback)));
}
