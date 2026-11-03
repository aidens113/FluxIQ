import type { JsonValue } from "../../../../core/index.ts";

export type AutomationStudioFlowBootstrapRouteSituation = {
  /** Where it was seen: where the run starts, or after which exploration step. */
  seen: string;
  /** Each observed path and its value, whole. A path not listed was absent. */
  state: Record<string, JsonValue>;
};
