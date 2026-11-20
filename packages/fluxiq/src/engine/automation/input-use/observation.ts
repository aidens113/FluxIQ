import type { AutomationStudioInputRevision } from "../../../runtime/input-basis/contracts/index.ts";
import type { AutomationStudioInputUseLocation } from "./location.ts";
import type { AutomationStudioInputUseUnknown } from "./unknown.ts";

export type AutomationStudioInputUseObservation =
  | Readonly<{ status: "sealed"; coverage: "graph_entry_inputs"; reference: AutomationStudioInputRevision; location: AutomationStudioInputUseLocation }>
  | Readonly<{ status: "unknown"; code: AutomationStudioInputUseUnknown }>;
