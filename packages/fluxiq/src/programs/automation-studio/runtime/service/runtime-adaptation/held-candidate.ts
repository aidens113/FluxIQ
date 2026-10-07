// A held re-author runs unapplied only when its whole topology is the selected
// Subflow graph. Other shapes are refused until a whole-topology candidate
// executor exists. Refusal never changes the accepted graph or applies the edit.

import type { AutomationStudioFlowArtifact, AutomationStudioFlowSubflow } from "../../../model/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioRepairRerunInput } from "./repair-rerun.ts";

/**
 * What could not be read or done, which the re-run declines its pass for, under
 * its own codes (`./repair-rerun.ts`).
 */
export type AutomationStudioHeldReauthorUnreadable = "heldReauthor" | "subflow" | "subflowAbsent";

/** Why a held re-author cannot yet be executed without applying it. */
const UNSUPPORTED_TOPOLOGY = {
  noSubflow: "no_selected_subflow",
  notOneSubflow: "not_one_subflow",
  otherSubflow: "other_subflow",
  otherGraph: "other_graph",
  routesElsewhere: "router_routes_elsewhere"
} as const;

/** Reads an unapplied held graph, or refuses an unsupported/unreadable edit. */
export async function automationStudioHeldReauthorCandidate(
  input: AutomationStudioRepairRerunInput,
  adaptationId: string
): Promise<{ flow: AutomationStudioFlowArtifact } | { unsupportedTopology: string } | { unreadable: AutomationStudioHeldReauthorUnreadable }> {
  const flowId = input.adaptationContext.flowId;
  let adaptation: AutomationStudioBootstrapAdaptation | null;
  try {
    adaptation = await input.ports.getFlowBootstrapAdaptation(input.projectId, flowId, adaptationId);
  } catch {
    return { unreadable: "heldReauthor" };
  }
  if (adaptation?.status !== "validated") return { unreadable: "heldReauthor" };
  return heldGraph(input, adaptation);
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
): Promise<{ flow: AutomationStudioFlowArtifact } | { unsupportedTopology: string } | { unreadable: AutomationStudioHeldReauthorUnreadable }> {
  const subflowId = input.subflowId;
  if (!subflowId) return { unsupportedTopology: UNSUPPORTED_TOPOLOGY.noSubflow };
  const entries = adaptation.topology.subflows;
  const entry = entries[0];
  if (entries.length !== 1 || !entry) return { unsupportedTopology: UNSUPPORTED_TOPOLOGY.notOneSubflow };
  if (entry.subflow.subflowId !== subflowId) return { unsupportedTopology: UNSUPPORTED_TOPOLOGY.otherSubflow };
  let selected: AutomationStudioFlowSubflow | null;
  try {
    selected = await input.ports.getFlowSubflow(input.projectId, input.session.flowId, subflowId);
  } catch {
    return { unreadable: "subflow" };
  }
  if (!selected?.graphFlowId) return { unreadable: "subflowAbsent" };
  if (entry.subflow.graphFlowId !== selected.graphFlowId || entry.graphFlow.flowId !== selected.graphFlowId) return { unsupportedTopology: UNSUPPORTED_TOPOLOGY.otherGraph };
  const router = adaptation.topology.router;
  if (!router.rules.every((rule) => rule.target.subflowId === subflowId)
    || (router.fallback?.kind === "subflow" && router.fallback.subflowId !== subflowId)) {
    return { unsupportedTopology: UNSUPPORTED_TOPOLOGY.routesElsewhere };
  }
  if (entry.graphFlow.metadata?.parentFlowId !== input.session.flowId || entry.graphFlow.metadata?.parentSubflowId !== subflowId) {
    throw new Error("Held re-author Subflow graph ownership does not match the selected parent and Subflow.");
  }
  return { flow: structuredClone(entry.graphFlow) };
}
