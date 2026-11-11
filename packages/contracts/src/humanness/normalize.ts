import { HUMANNESS_DEFAULT, HUMANNESS_MAX, HUMANNESS_MIN } from "./bounds.ts";
import type { Humanness } from "./humanness.ts";

/** A finite number is rounded and clamped into 0..100; anything else is `HUMANNESS_DEFAULT`. */
export function normalizeHumanness(value: unknown): Humanness {
  if (typeof value !== "number" || !Number.isFinite(value)) return HUMANNESS_DEFAULT;
  return Math.min(HUMANNESS_MAX, Math.max(HUMANNESS_MIN, Math.round(value)));
}
