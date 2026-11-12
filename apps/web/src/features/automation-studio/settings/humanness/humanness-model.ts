/**
 * Humanness: one integer 0-100 per FluxNode, task and Flow. 0 is maximum speed with no added
 * waits and is the default; higher looks more like a person. Precedence: run option, task, Flow,
 * the person's starting value, then 0. The control itself is `@fluxiq/ui-components`'s; this is
 * the panel's glue: the stored value, the draft text and the save payload.
 */
export const HUMANNESS_MIN = 0;
export const HUMANNESS_MAX = 100;

/** A stored value, or null when it is absent or not an integer in range ("uses the starting value"). */
export function humannessFromStored(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= HUMANNESS_MIN && value <= HUMANNESS_MAX ? value : null;
}

export function clampHumanness(value: number): number {
  return Math.min(HUMANNESS_MAX, Math.max(HUMANNESS_MIN, Math.round(value)));
}

/** The draft holds the value as text, "" meaning the Flow has none of its own. */
export function humannessDraftValue(value: unknown): string {
  const stored = humannessFromStored(value);
  return stored === null ? "" : String(stored);
}

/** What a save sends: the number, or null to clear the Flow's own value. */
export function humannessSavePayload(draftValue: string): number | null {
  if (!draftValue.trim()) return null;
  const parsed = Number(draftValue);
  return Number.isFinite(parsed) ? clampHumanness(parsed) : null;
}
