// An answer-first attempt's draft has been saved: its parts go into the project's library
// now, rather than at an apply that may never come, so the next attempt finds them.
//
// The draft is not applied and has no graph revision, so the parts are saved with none, and
// no judgement can be about them yet. When the draft is applied its graphs are saved again
// under their own ids and revision: the same shape answers `existing` and adds that graph as
// another source of the version, so its judged runs reach the part's trust (`save-applied-flow.ts`).
//
// **It never changes the attempt's outcome.** The draft is what the attempt left behind and
// the library can be written again at the next save, so a failure here is reported by its
// error's name on the build trace and on the result, and never thrown.
import { automationStudioLlmBuildTrace } from "../../../../runtime/llm/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";
import { normalizeAutomationStudioFlowBuildPlan } from "../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowCandidate } from "../../../../runtime/flow-authoring/bootstrap/candidate/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import { AutomationStudioProjectPartControlKeys } from "./control-keys.ts";
import { saveProjectPartsOfAppliedFlow } from "./save-applied-flow.ts";
import { firstLiteralAddress } from "./start-location.ts";
import type { AutomationStudioSaveProjectPartsResult } from "./types.ts";

export type AutomationStudioSaveProjectPartsOfDraftInput = {
  projectId: string;
  flowId: string;
  /** The saved draft's id: the plan's graphs are named from it, as an applied adaptation's are from its own. */
  candidateId: string;
  buildPlan: AutomationStudioFlowCandidate["buildPlan"];
  instructionIds: readonly string[];
  /** The person's request, as written. Compared with, never stored. */
  instructionText: string;
  startLocation?: string | undefined;
  now?: number | undefined;
};

export async function saveProjectPartsOfDraft(pool: AutomationStudioProjectDatabasePool | undefined, input: AutomationStudioSaveProjectPartsOfDraftInput): Promise<AutomationStudioSaveProjectPartsResult | undefined> {
  if (!pool) return undefined;
  return await automationStudioLlmBuildTrace.timed("save-draft-parts", async () => {
    try {
      const now = input.now ?? Date.now();
      const topology = normalizeAutomationStudioFlowBuildPlan({
        adaptationId: `draft.${input.candidateId}`,
        parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: input.flowId, projectId: input.projectId, name: input.flowId, now }),
        buildPlan: input.buildPlan,
        sourceInstructionIds: [...input.instructionIds],
        now
      });
      const subflows = topology.subflows.map(({ subflow, graphFlow }) => ({ subflow, graphFlow }));
      const startLocation = firstLiteralAddress(subflows.map((entry) => entry.graphFlow)) ?? input.startLocation;
      const controlParameterKeys = AutomationStudioProjectPartControlKeys.of(pool);
      return await saveProjectPartsOfAppliedFlow({
        pool,
        ...(controlParameterKeys ? { controlParameterKeys } : {}),
        projectId: input.projectId,
        flowId: input.flowId,
        subflows,
        requestWords: input.instructionText,
        ...(startLocation ? { startLocation } : {}),
        ...(input.now !== undefined ? { now: input.now } : {})
      });
    } catch (error) {
      return { saved: [], skipped: [], failed: error instanceof Error ? error.name : "Error" };
    }
  }, (result) => `saved=${result.saved.length} skipped=${result.skipped.length}${result.failed ? ` failed=${result.failed}` : ""}`);
}
