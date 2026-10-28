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
//
// **And what the trial changed on the site (t775).** A trial is judged against
// the site's state just before it and the change the task asks for (user,
// 2026-10-27): a list line at 9 that is 10 after a part asking to add 1 is met,
// with no reset. The caller that read the trial's witnesses hands the packet
// (`siteChange`, `../../flow-bootstrap/trial-change/`) and Core's findings over
// it; both are screened (`../../result-verification/site-change/screened.ts`)
// and set after `startedWith`, before `earlierAdvice`, which stays last. The
// trial's `already_in_state` steps (`./landed-acts.ts`) reach the judge inside
// the packet's `acts`: this summary is given the trace, not the trial's acts,
// so building those is the caller's that builds the packet.

import type { AutomationStudioFlowArtifact, AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import { automationStudioResultEndViewRead, summarizeAutomationStudioRunResult, type AutomationStudioResultEarlierAdvice, type AutomationStudioResultEndView, type AutomationStudioResultRecordSetInput, type AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import type { AutomationStudioTrialChangeFinding, AutomationStudioTrialSiteChange } from "../../flow-bootstrap/trial-change/index.ts";
import { automationStudioResultSiteChangeScreened } from "../../result-verification/site-change/index.ts";
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
  /** What Core read at each place the trial's change shows, just before and just after it, and what that proves of each part (header, t775). */
  siteChange?: AutomationStudioTrialSiteChange | undefined;
  /** Core's closed findings over `siteChange` (`automationStudioTrialChangeFindings`, header). */
  siteChangeFindings?: readonly AutomationStudioTrialChangeFinding[] | undefined;
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
  const changed = input.siteChange ? withSiteChange(started, input.siteChange, input.siteChangeFindings, input.deniedEvidenceKeys) : started;
  // Last, so the summary before it is the judge's cached prefix unchanged (header, t752).
  return input.earlierAdvice?.length ? { ...changed, earlierAdvice: structuredClone([...input.earlierAdvice]) } : changed;
}

/** The summary with the trial's change after everything before it, screened (header, t775); a text withheld marks the summary `withheld`. */
function withSiteChange(summary: AutomationStudioRunResultSummary, siteChange: AutomationStudioTrialSiteChange, findings: readonly AutomationStudioTrialChangeFinding[] | undefined, deniedEvidenceKeys: readonly string[] | undefined): AutomationStudioRunResultSummary {
  const screened = automationStudioResultSiteChangeScreened({ siteChange, findings, deniedEvidenceKeys });
  return { ...summary, ...(screened.withheld ? { withheld: true } : {}), siteChange: screened.siteChange, ...(screened.siteChangeFindings ? { siteChangeFindings: screened.siteChangeFindings } : {}) };
}
