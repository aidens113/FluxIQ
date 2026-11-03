import { partialTrialFrames } from "./frames.ts";

/** A Core frame may require the actual engine or a child in its current callback source. */
export function bindPartialTrialFrame(callback: object, descendant: boolean | "callbacks" = false): void {
  partialTrialFrames.set(callback, Object.freeze({ automation: descendant === true, callbacks: descendant === "callbacks" }));
}
