import type { AutomationStudioRunOverrides } from "./frame.ts";
import { automationStudioRunOverridesStore } from "./store.ts";

/**
 * Runs `fn` with `frame` as its run's overrides: what `automationStudioRunOverrides` reads anywhere
 * in `fn`'s async chain, and nowhere else. A frame set inside another replaces it whole (a child run
 * never inherits its parent's), so set one, even empty, around every run.
 */
export function runWithAutomationStudioRunOverrides<T>(frame: AutomationStudioRunOverrides, fn: () => T): T {
  return automationStudioRunOverridesStore.run(Object.freeze(structuredClone(frame)), fn);
}
