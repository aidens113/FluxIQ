import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../flows/executable/permissions/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "./definition.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "./execution-result.ts";

export type AutomationStudioHarnessOptionLoopBinding = {
  tools: AutomationStudioLlmEvidenceTool[];
  executeTool(input: {
    callId: string;
    toolId: string;
    value: JsonObject;
    signal?: AbortSignal;
    /** Fixed execution date reference, never part of model-authored tool values. */
    referenceNow?: number;
    /**
     * The run's permission check for this one action, from the run's
     * `AutomationStudioActionPermissionGate`. Both of Core's callers -- Flow
     * authoring and the recovery exploration -- always pass one. Absent, the
     * option is handed `automationStudioActionPermissionDenied`: an action
     * driven with no run behind it has nobody to ask, so nothing with a
     * lasting consequence is permitted.
     */
    permission?: AutomationStudioActionPermissionCheck;
  }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /**
   * The keys of a result that are a view of the target, declared by the
   * bundles with an option offered here; absent when none declared any. The
   * loop shows the newest view whole and replaces every earlier one
   * (`../context-window.ts`).
   */
  observedStateKeys?: readonly string[];
};
