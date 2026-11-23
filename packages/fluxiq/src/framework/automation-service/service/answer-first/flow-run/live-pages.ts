// A saved Flow's record batches, told to the attempt's one result as they are captured (lane t905's pages, t984).
// Each batch is a page of the draft step its node stands for (`./batch-steps.ts`), read through the graph the run
// selected: that is the graph the run returns at its end, so a page told here is the page the end would have told.
// Told as it is captured, the read is on the attempt's result before the run's next step goes out, so the attempt's
// row can hold it (`../attempt/flow-stage.ts`): a Core that dies mid-press then still has the rows its run read, and
// carrying on, which never runs the Flow from its start again, needs no read again either.
//
// A batch captured before the run selected its graph waits for the next one, or for the run's end, and goes in the
// order it was captured. A run that never selected a graph pages nothing, as before.
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstFlowRunBatchSteps } from "./batch-steps.ts";
import type { AutomationStudioAnswerFirstFlowRunPorts } from "./ports.ts";
import type { AutomationStudioAnswerFirstFlowRunEnded } from "./steps-ran.ts";

type Graph = NonNullable<AutomationStudioAnswerFirstFlowRunEnded["graph"]>;

export type AutomationStudioAnswerFirstFlowRunLivePages = {
  /** The graph the run selected, before its first node runs. */
  selected(graph: Graph): void;
  /** One batch, as the run captured it. */
  captured(batch: AutomationStudioRecordBatch): void;
  /** The run has ended, with the graph it returned, if any. */
  ended(graph: Graph | undefined): void;
};

export function automationStudioAnswerFirstFlowRunLivePages(
  result: AutomationStudioAnswerFirstFlowRunPorts["result"],
  plan: { buildPlan: AutomationStudioFlowBuildPlan; locator: AutomationStudioFlowBootstrapIssueLocator | undefined; saved: readonly AutomationStudioFlowDraftStep[] }
): AutomationStudioAnswerFirstFlowRunLivePages {
  let graph: Graph | undefined;
  const waiting: AutomationStudioRecordBatch[] = [];
  const tell = (through: Graph | undefined): void => {
    const batches = waiting.splice(0);
    if (!result || !batches.length || !through) return;
    result.batches(automationStudioAnswerFirstFlowRunBatchSteps({ ...plan, graph: through }, batches));
  };
  return {
    selected(selectedGraph) { graph = selectedGraph; },
    captured(batch) {
      waiting.push(batch);
      if (graph) tell(graph);
    },
    ended(endedGraph) { tell(endedGraph ?? graph); }
  };
}
