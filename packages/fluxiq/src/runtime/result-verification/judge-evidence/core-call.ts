// Whether a call or step the trail names by its definition is Core's own, answered by Core and never by the host
// (t1032): one of Core's tools, or a node of Core's own control flow or timing.
//
// - **Core's tools** are named in its `core.` namespace; the four that run the host's nodes are the host's to answer,
//   and a call of them names its node as its definition anyway (`../run-trail/of/call.ts`). Run-mwv5m906-5e999159
//   handed `core.set_result_processing` and `core.recall_result` answers to the web domain's projector, which named
//   them gaps (`action_invalid`, `evidence_unrecognized`).
// - **Core's control-flow and timing nodes** (a wait, a merge, a For Each, a branch) answer with Core's routing and
//   timing bookkeeping (`{ data: null }`, `{ next, mergeMode }`, `{ item, index, count }`), which nothing on a page
//   says; t1029 found the web projector naming them gaps too, on every trial with a wait, a loop or a branch.
//
// Core holds every yes unsure while a gap is named, and no act or read could clear these. Core's own are now Core's to
// account for (`./project.ts`): their accounts reach the judge where Core puts them (the result's processing account,
// the rows and pages a recall restored, the trail's framework facts), and no host can mark them as gaps.
import { getAutomationNodeDefinition } from "../../../components/automation/index.ts";
import {
  AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID,
  AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
  AUTOMATION_STUDIO_LLM_RUN_NODES_TOOL_ID,
  AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID
} from "../../llm/index.ts";

const CORE_NAMESPACE = "core.";
/** Core's tools that run the host's nodes: what they answer is the host's. */
const HOST_RUNS: ReadonlySet<string> = new Set([AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, AUTOMATION_STUDIO_LLM_RUN_NODES_TOOL_ID, AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID]);
/** Core's node classes whose outputs are its own routing and timing bookkeeping. */
const BOOKKEEPING_CLASSES: ReadonlySet<string> = new Set(["control-flow", "timing"]);

export function automationStudioJudgeEvidenceIsCoreCall(definitionId: string | undefined): boolean {
  if (definitionId === undefined) return false;
  if (definitionId.startsWith(CORE_NAMESPACE)) return !HOST_RUNS.has(definitionId);
  return BOOKKEEPING_CLASSES.has(getAutomationNodeDefinition(definitionId)?.class ?? "");
}
