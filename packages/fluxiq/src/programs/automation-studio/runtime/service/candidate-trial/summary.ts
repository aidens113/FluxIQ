// What the judge is shown of a trial: the trial's own run, and nothing else.
//
// The legacy build judge summarised the build's exploration draft
// (`../flow-bootstrap-commands/build-judge.ts` reads `loop.steps`), so a page
// exploration had already changed could pass for the Flow's work. Here the
// summary is the one a finished run's result check gets
// (`summarizeAutomationStudioRunResult`), built from the trial run alone: its
// record sets read under the trial's run id, the graph that ran, the trace's
// attempts (what each step changed, and the page it started on) and the page
// it ended on. No draft step, evidence window or exploration call is an input.

import type { AutomationStudioFlowArtifact, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import { automationStudioResultEndViewRead, summarizeAutomationStudioRunResult, type AutomationStudioResultEndView, type AutomationStudioResultRecordSetInput, type AutomationStudioRunResultSummary } from "../../result-verification/index.ts";

/** The judge's summary of one trial run. */
export async function automationStudioCandidateTrialSummary(input: {
  recordSets: readonly AutomationStudioResultRecordSetInput[];
  graph: AutomationStudioFlowArtifact | undefined;
  trace: AutomationStudioGraphExecutionTrace | undefined;
  readEndView?: (() => Promise<AutomationStudioResultEndView | undefined>) | undefined;
  actionAttempts?: readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined;
  observedStateKeys?: readonly string[] | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
}): Promise<AutomationStudioRunResultSummary> {
  const ended = await automationStudioResultEndViewRead(input.readEndView);
  return summarizeAutomationStudioRunResult({
    recordSets: input.recordSets,
    ...(input.graph ? { flowNodes: input.graph.nodes, flowEdges: input.graph.edges } : {}),
    ...ended,
    ...(input.actionAttempts ? { actionAttempts: input.actionAttempts } : {}),
    ...(input.trace ? { sessionAttempts: input.trace.attempts, ...(input.observedStateKeys ? { observedStateKeys: input.observedStateKeys } : {}) } : {}),
    ...(input.deniedEvidenceKeys !== undefined ? { deniedEvidenceKeys: input.deniedEvidenceKeys } : {})
  });
}
