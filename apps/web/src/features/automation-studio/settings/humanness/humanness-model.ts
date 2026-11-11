/**
 * Humanness: one integer 0-100 per FluxNode, task and Flow. 0 is maximum speed with no added
 * waits and is the default; higher looks more like a person (randomised timing, click points,
 * harmless misclicks). Precedence: run option, task, Flow, the person's starting value, then 0.
 *
 * These mirror the bounds and default of `@fluxiq/contracts` (W2's interface I1). The contracts
 * package does not export them in this tree yet, so they are local constants; switch to the
 * contracts export once it lands.
 */
export const HUMANNESS_MIN = 0;
export const HUMANNESS_MAX = 100;
export const HUMANNESS_DEFAULT = 0;
export const HUMANNESS_KEY_STEP = 1;
export const HUMANNESS_PAGE_STEP = 10;

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

/** The value after a key press, or null when the key is not one the slider handles. */
export function humannessAfterKey(current: number, key: string): number | null {
  switch (key) {
    case "ArrowRight": case "ArrowUp": return clampHumanness(current + HUMANNESS_KEY_STEP);
    case "ArrowLeft": case "ArrowDown": return clampHumanness(current - HUMANNESS_KEY_STEP);
    case "PageUp": return clampHumanness(current + HUMANNESS_PAGE_STEP);
    case "PageDown": return clampHumanness(current - HUMANNESS_PAGE_STEP);
    case "Home": return HUMANNESS_MIN;
    case "End": return HUMANNESS_MAX;
    default: return null;
  }
}
