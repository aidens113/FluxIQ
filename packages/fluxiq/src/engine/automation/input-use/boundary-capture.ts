import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioCallFlowConfiguration } from "../../../flows/executable/composite/index.ts";

/** Full raw handoff retained before any child-frame projection. */
export type AutomationStudioInputUseBoundaryCapture = Readonly<{
  inputs: JsonObject;
  declaredInputDefaults: JsonObject;
  contract: Pick<AutomationStudioFlowArtifact, "interface" | "errors" | "executionDefaults">;
  bindings: Omit<AutomationStudioCallFlowConfiguration, "target">;
  callInputs: Record<string, JsonValue>;
}>;
