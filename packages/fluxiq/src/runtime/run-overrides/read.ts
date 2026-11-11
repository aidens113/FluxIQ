import type { AutomationStudioRunOverrides } from "./frame.ts";
import { automationStudioRunOverridesStore } from "./store.ts";

/** The current run's overrides, or nothing outside every run that set them (Core's defaults then hold). */
export function automationStudioRunOverrides(): Readonly<AutomationStudioRunOverrides> | undefined {
  return automationStudioRunOverridesStore.getStore();
}
