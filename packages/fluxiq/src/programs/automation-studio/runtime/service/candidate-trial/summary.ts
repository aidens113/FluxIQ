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
//
// **And what earlier judged trials of the build advised (t752).** A revision
// made exactly the change an earlier no's judge advised, and its judges, told
// nothing of it, answered no for that change. The gate that keeps the build's
// trials hands each request `earlierAdvice` (`../../flow-bootstrap/candidate/earlier-advice-memory.ts`),
// appended last here so the summary before it, the judge's cached prefix, is unchanged.

import type { AutomationStudioFlowArtifact, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import { automationStudioResultEndViewRead, summarizeAutomationStudioRunResult, type AutomationStudioResultEarlierAdvice, type AutomationStudioResultEndView, type AutomationStudioResultRecordSetInput, type AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import { automationStudioCandidateFrameEvidence } from "./frame-evidence.ts";

/** The judge's summary of one trial run. */
export async function automationStudioCandidateTrialSummary(input: {
  recordSets: readonly AutomationStudioResultRecordSetInput[];
  graph: AutomationStudioFlowArtifact | undefined;
  trace: AutomationStudioGraphExecutionTrace | undefined;
  readEndView?: (() => Promise<AutomationStudioResultEndView | undefined>) | undefined;
  actionAttempts?: readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined;
  observedStateKeys?: readonly string[] | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
  /** What of the build was already on the site when the trial began (t471, `AutomationStudioCandidateTrialRequest.startedWith`). */
  startedWith?: readonly string[] | undefined;
  /** What earlier judged trials of the build advised, and whether this revision changed what each named (header, t752). */
  earlierAdvice?: readonly AutomationStudioResultEarlierAdvice[] | undefined;
}): Promise<AutomationStudioRunResultSummary> {
  const ended = await automationStudioResultEndViewRead(input.readEndView);
  const frames = automationStudioCandidateFrameEvidence(input.trace?.attempts ?? [], input.graph);
  const summary = summarizeAutomationStudioRunResult({
    recordSets: input.recordSets,
    ...(input.graph ? { flowNodes: input.graph.nodes, flowEdges: input.graph.edges } : {}),
    ...ended,
    ...(input.actionAttempts ? { actionAttempts: input.actionAttempts.filter((attempt) => !attempt.subflowTarget) } : {}),
    ...(input.trace ? { sessionAttempts: frames.attempts.filter((attempt) => !attempt.subflowTarget), ...(input.observedStateKeys ? { observedStateKeys: input.observedStateKeys } : {}) } : {}),
    ...(input.deniedEvidenceKeys !== undefined ? { deniedEvidenceKeys: input.deniedEvidenceKeys } : {})
  });
  const started = input.startedWith?.length ? { ...summary, startedWith: [...input.startedWith] } : summary;
  // Last, so the summary before it is the judge's cached prefix unchanged (header, t752).
  return input.earlierAdvice?.length ? { ...started, earlierAdvice: structuredClone([...input.earlierAdvice]) } : started;
}
