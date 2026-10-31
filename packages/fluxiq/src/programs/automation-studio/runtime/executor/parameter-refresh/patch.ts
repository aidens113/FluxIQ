import type { JsonValue } from "../../../../../core/index.ts";

/** One atomic target-field edit, limited to a flat ID in a trusted refresh declaration. */
export type AutomationStudioTargetRefreshPatch =
  | { operation: "set"; parameterId: string; value: JsonValue }
  | { operation: "remove"; parameterId: string };
