import { partialTrialFrames } from "./frames.ts";

/** A canonical adapter accounts for its own children; an engine frame also requires the actual engine owner. */
export function bindPartialTrialFrame(callback: object, automation = false): void {
  partialTrialFrames.set(callback, Object.freeze({ automation }));
}
