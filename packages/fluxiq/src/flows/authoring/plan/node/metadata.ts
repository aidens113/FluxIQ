import type { AutomationStudioFlowBootstrapEntry } from "./entry.ts";
import type { AutomationStudioFlowBootstrapCheckpoint } from "./checkpoint.ts";

export type AutomationStudioFlowBootstrapNodeMetadata = {
  "fluxiq.entry"?: AutomationStudioFlowBootstrapEntry;
  "fluxiq.checkpoint"?: AutomationStudioFlowBootstrapCheckpoint;
};
