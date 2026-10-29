// A library loop run through the real executor (t796): for each of three books,
// open it, close the library's banner if it shows (an optional step), then
// place a hold and wait, both written `only after:` the banner close -- the
// guarded shape `flow-bootstrap/script-statements/guarded-steps.ts` assembles.
// The hold declares a lasting consequence; the wait does none. The banner shows
// on the passes `bannerOn` names (1-based) and is absent on every other.
import type { AutomationStudioFlowArtifact, AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../../../../executor/index.ts";

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
const press = (id: string, elementId: string, label: string, consequences?: string[]): AutomationStudioFlowNode => ({
  id, label, definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId } }, ...(consequences ? { metadata: { declaredConsequences: consequences } } : {})
});

/** The loop's graph and one run of it, the banner shown on the passes `bannerOn` names. */
export async function runLibraryHolds(bannerOn: readonly number[] = []): Promise<{ graph: AutomationStudioFlowArtifact; trace: AutomationStudioGraphExecutionTrace }> {
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1", flowId: "flow.library-holds", ownerKind: "routine", ownerId: "routine.test", name: "Library holds", createdAt: 1, updatedAt: 1,
    nodes: [
      { id: "books", definitionId: "builtin.data.constant", parameterValues: { value: [1, 2, 3] } },
      { id: "head", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "each", definitionId: "builtin.control.for-each" },
      press("open", "open-book", "open the book"),
      press("banner", "banner-close", "close the library banner"),
      press("hold", "place-hold", "place a hold", ["create_new"]),
      { id: "settle", label: "wait for the hold to settle", definitionId: "builtin.timing.wait", parameterValues: { duration: 1, unit: "seconds" } },
      { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "end", definitionId: "builtin.control.end" }
    ],
    edges: [
      edge("books", "success", "head"), edge("books", "value", "each", "items"), edge("head", "success", "each"),
      edge("each", "body", "open"), edge("open", "success", "banner"),
      edge("banner", "failed", "join"), edge("banner", "success", "hold"), edge("hold", "success", "settle"), edge("settle", "success", "join", "branches"),
      edge("join", "success", "head", "branches"), edge("each", "done", "end")
    ]
  };
  let banners = 0;
  const dispatch: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => {
    if (!JSON.stringify(effect.payload ?? null).includes("banner-close")) return { status: "success", route: "success", outputs: { ok: true } };
    banners += 1;
    return bannerOn.includes(banners)
      ? { status: "success", route: "success", outputs: { ok: true } }
      : { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } };
  };
  const trace = await runAutomationStudioGraph(flow, {
    effectDispatcher: dispatch,
    recoveryBudget: { maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 2, maxReroutesPerRun: 2 },
    startNodeId: "books",
    delay: async () => {}
  });
  return { graph: flow as unknown as AutomationStudioFlowArtifact, trace };
}
