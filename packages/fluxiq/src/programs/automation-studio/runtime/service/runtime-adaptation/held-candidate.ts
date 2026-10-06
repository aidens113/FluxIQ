// What the re-run of a held re-author runs (t267).
//
// Both re-author routes approve their extend-mode edit and hold it
// (`./reauthor-build.ts`). A re-run from the start whose latest re-author is
// held runs the held graph unapplied when that graph is all the edit changes: an
// extend keeps the selected Subflow's ids and overwrites its graph under them
// (`flow-bootstrap/adaptation.ts`), so a held topology of that one Subflow, on
// the same graph Flow, with every router rule targeting it, is exactly what an
// apply would store. Any other shape -- a run with no selected Subflow, a
// second Subflow, a router that routes elsewhere -- cannot be run as one graph,
// so it is applied first, as it was before t267, and the run says why
// (`appliedBeforeJudged`). The run's judged end settles a held edit the pass ran
// (`./judged-reauthor.ts`).

import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow } from "../../../model/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioRepairRerunInput } from "./repair-rerun.ts";

/**
 * What could not be read or done, which the re-run declines its pass for, under
 * its own codes (`./repair-rerun.ts`).
 */
export type AutomationStudioHeldReauthorUnreadable = "heldReauthor" | "heldReauthorApply" | "subflow" | "subflowAbsent";

/** Why a held re-author could not be run unapplied, and was applied before its re-run instead. */
const APPLIED_BEFORE_JUDGED = {
  noSubflow: "no_selected_subflow",
  notOneSubflow: "not_one_subflow",
  otherSubflow: "other_subflow",
  otherGraph: "other_graph",
  routesElsewhere: "router_routes_elsewhere"
} as const;

/**
 * What the re-run of a held re-author runs: the held graph, unapplied, or --
 * where the held topology is not the selected Subflow's graph alone -- nothing
 * here, once the edit has been applied as before. A held record that cannot be
 * read, or an apply that is refused, declines the pass, under the key the re-run
 * reads its code by.
 */
export async function automationStudioHeldReauthorCandidate(
  input: AutomationStudioRepairRerunInput,
  adaptationId: string
): Promise<{ flow: AutomationStudioFlowArtifact } | { appliedBeforeJudged: string } | { unreadable: AutomationStudioHeldReauthorUnreadable }> {
  const flowId = input.adaptationContext.flowId;
  let adaptation: AutomationStudioBootstrapAdaptation | null;
  try {
    adaptation = await input.ports.getFlowBootstrapAdaptation(input.projectId, flowId, adaptationId);
  } catch {
    return { unreadable: "heldReauthor" };
  }
  if (adaptation?.status !== "validated") return { unreadable: "heldReauthor" };
  const graph = await heldGraph(input, adaptation);
  if (!("appliedBeforeJudged" in graph)) return graph;
  try {
    await input.ports.applyFlowBootstrapAdaptation({ projectId: input.projectId, flowId, adaptationId, actorId: "runtime.result_repair" });
  } catch {
    return { unreadable: "heldReauthorApply" };
  }
  return graph;
}

/**
 * The held graph, when running it is running the edit: an extend reuses the
 * selected Subflow and its graph Flow and overwrites that graph under the same
 * ids (`flow-bootstrap/adaptation.ts`), so a topology of that one Subflow, which
 * every router rule targets, changes nothing a run of the graph alone would miss.
 * Its ownership is checked as `changedFlow` checks the stored graph's.
 */
async function heldGraph(
  input: AutomationStudioRepairRerunInput,
  adaptation: AutomationStudioBootstrapAdaptation
): Promise<{ flow: AutomationStudioFlowArtifact } | { appliedBeforeJudged: string } | { unreadable: AutomationStudioHeldReauthorUnreadable }> {
  const subflowId = input.subflowId;
  if (!subflowId) return { appliedBeforeJudged: APPLIED_BEFORE_JUDGED.noSubflow };
  const entries = adaptation.topology.subflows;
  const entry = entries[0];
  if (entries.length !== 1 || !entry) return { appliedBeforeJudged: APPLIED_BEFORE_JUDGED.notOneSubflow };
  if (entry.subflow.subflowId !== subflowId) return { appliedBeforeJudged: APPLIED_BEFORE_JUDGED.otherSubflow };
  let selected: AutomationStudioFlowSubflow | null;
  try {
    selected = await input.ports.getFlowSubflow(input.projectId, input.session.flowId, subflowId);
  } catch {
    return { unreadable: "subflow" };
  }
  if (!selected?.graphFlowId) return { unreadable: "subflowAbsent" };
  if (entry.subflow.graphFlowId !== selected.graphFlowId || entry.graphFlow.flowId !== selected.graphFlowId) return { appliedBeforeJudged: APPLIED_BEFORE_JUDGED.otherGraph };
  const router = adaptation.topology.router;
  if (!router.rules.every((rule) => rule.target.subflowId === subflowId)
    || (router.fallback?.kind === "subflow" && router.fallback.subflowId !== subflowId)) {
    return { appliedBeforeJudged: APPLIED_BEFORE_JUDGED.routesElsewhere };
  }
  if (entry.graphFlow.metadata?.parentFlowId !== input.session.flowId || entry.graphFlow.metadata?.parentSubflowId !== subflowId) {
    throw new Error("Held re-author Subflow graph ownership does not match the selected parent and Subflow.");
  }
  return { flow: structuredClone(entry.graphFlow) };
}
