// A build's Flow has just been saved: its parts go into the project's library.
//
// The Flow is what the person paid for, and the library can be written again at
// its next save, so a failure here never undoes the Flow. It is reported on the
// build's trace by its error's name, and on the result, rather than thrown.
import { automationStudioFlowGraphVersion } from "../../../../runtime/flow-authoring/version/index.ts";
import { automationStudioLlmBuildTrace } from "../../../../runtime/llm/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowInstruction } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import { AutomationStudioProjectPartControlKeys } from "./control-keys.ts";
import { saveProjectPartsOfAppliedFlow } from "./save-applied-flow.ts";
import { firstLiteralAddress } from "./start-location.ts";
import type { AutomationStudioSaveProjectPartsResult } from "./types.ts";

/** The parts of an applied adaptation, written to the library; nothing when the service keeps no project database. */
export async function saveProjectPartsOfAppliedAdaptation(input: {
  pool: AutomationStudioProjectDatabasePool | undefined;
  adaptation: Pick<AutomationStudioBootstrapAdaptation, "projectId" | "flowId" | "topology">;
  readGraph: (graphFlowId: string) => Promise<AutomationStudioFlowArtifact>;
  instructions: () => Promise<readonly Pick<AutomationStudioFlowInstruction, "body">[]>;
}): Promise<AutomationStudioSaveProjectPartsResult | undefined> {
  const { pool, adaptation } = input;
  if (!pool) return undefined;
  return await automationStudioLlmBuildTrace.timed("save-parts", async () => {
    try {
      const subflows = await Promise.all(adaptation.topology.subflows.map(async (entry) => {
        const graphFlow = await input.readGraph(entry.subflow.graphFlowId ?? entry.graphFlow.flowId);
        const revision = automationStudioFlowGraphVersion({ flow: graphFlow }).revision;
        return { subflow: entry.subflow, graphFlow, ...(typeof revision === "number" ? { sourceGraphRevision: revision } : {}) };
      }));
      const startLocation = firstLiteralAddress(subflows.map((entry) => entry.graphFlow));
      const controlParameterKeys = AutomationStudioProjectPartControlKeys.of(pool);
      return await saveProjectPartsOfAppliedFlow({
        pool,
        ...(controlParameterKeys ? { controlParameterKeys } : {}),
        projectId: adaptation.projectId,
        flowId: adaptation.flowId,
        subflows,
        requestWords: (await input.instructions()).map((instruction) => instruction.body).join("\n"),
        ...(startLocation ? { startLocation } : {})
      });
    } catch (error) {
      return { saved: [], skipped: [], failed: error instanceof Error ? error.name : "Error" };
    }
  }, (result) => `saved=${result.saved.length} skipped=${result.skipped.length}${result.failed ? ` failed=${result.failed}` : ""}`);
}
