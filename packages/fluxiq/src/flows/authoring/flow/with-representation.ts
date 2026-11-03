import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioFlowRepresentationKind } from "./representation/index.ts";
import { AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION } from "./representation/index.ts";

export function withAutomationStudioFlowRepresentation(
  metadata: JsonObject | undefined,
  kind: AutomationStudioFlowRepresentationKind
): JsonObject {
  return {
    ...(metadata ?? {}),
    flowRepresentationVersion: AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION,
    flowRepresentationKind: kind
  };
}
