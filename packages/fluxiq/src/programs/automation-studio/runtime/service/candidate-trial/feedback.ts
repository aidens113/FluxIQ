// What the model is told about a trial, and the verdict it is bound to.
//
// Bounded JSON, written from Core's own codes and the judge's reading: which
// step failed and how (its failure code, never its message, which can quote
// the page), what the run stored, and what the judge expected and observed.
// Exploration evidence is never in it: the trial gate's contract
// (`../../flow-bootstrap/candidate/contracts.ts`) says the feedback is about
// the trial alone.
//
// **Each step says what it acted on and what happened (t356, C4).** Lane A
// round 4 (`run-muyrpbnk-fef374e7`, 0032 and 0048) told the model only "step 2,
// web.output.dom-click, failed, web.target.not_found" and then
// "web.action.rate_limited": no control, nothing to say the second may pass when
// tried again. A step now carries `control`, the words of the element its node
// targets (the identity the domain resolved from its handle at submission,
// already screened there: the same words the model's own step was bound to);
// `happened`, Core's plain sentence for the failure's category; `retryable`, the
// producer's word that the same act unchanged may pass; and the producer's
// `expected`/`actual`, which its contract keeps free of page content. The
// failure's free-text message is still never shown.
//
// **Nothing says how a control was found (t426).** The producer's
// `expected`/`actual` pass through the model-facing screen
// (`../../llm/model-facing/failure-text.ts`): none for a failure about
// finding the step's target, and otherwise only a text with no locator, score
// or word for the finding in it. The model names elements by handle only.
//
// **A failed check says what it waited for (t368).** A failed wait or assert
// adds what it waited for, whether the domain found that text hidden or absent,
// the visible text most like it, and that a check which only confirms the act
// before it is not needed (`./check-step.ts`, from lane A round 7). The
// snippets are page text the extension screened by its sensitive-value rules
// before they left the browser, bounded again here.
//
// **A step says what it got past (t378).** A refusal the run waited out and
// tried again is no longer folded into `attempts: 2` alone: the step lists it
// under `absorbed` (`./absorbed.ts`), and the paces the run learned from a site
// asking it to slow down are said once under `paces`.
//
// **A control still on the page says so (t420).** A step that could not find
// its control where it was saved, where the domain measured one like it still
// on the page, says that plainly, that the script need not change, and is
// retryable (`./target-on-page.ts`); the trial gate reads its
// `targetOnPage` to tell the model to test again rather than look for it.
//
// **A step says what the run closed over the page, and by which control (t470).**
// A layer the client closed while a step ran -- a slow-down notice, a
// promotion -- is listed under `interruptions`, with the handle of the way out
// it pressed when the domain could name it (`./interruptions.ts`), so a
// dismissing step is written against that control and no look-alike.
//
// **A read says what it saw and kept (t466).** A judged trial lists each list
// read with the rows it saw, kept and each condition rejected (`./reads.ts`).
// A read that kept no rows is a valid ending -- the loop over it ran no passes,
// which the executor no longer fails as unvisited steps
// (`../../executor/graph-navigation/zero-pass-loop.ts`) -- and is said as one,
// never as a fault in the Flow's connections.
//
// **A failed run says what its reads kept too, and blames no wiring a loop
// with no passes explains (t474).** Lane D round 9 (`run-mv5q4j2n-25784472`,
// revs 5 to 15) split one condition that accepts either form into two that
// must both hold, so its listing kept 0 of 8 rows. Seven trials were failed
// `executor.graph.unvisited_nodes` (the exemption above did not yet hold on
// the compiled graph), and each was told only "check the Flow's connections",
// with no `reads`: the model rewired its loop instead of fixing the condition.
// An execution-failed trial now carries the same read account a judged one
// does (`reads`, from the run's own read accounts), and its graph ending reads
// the run's loops: where every step it never reached lies inside a loop that
// ran no passes, it says so and does not ask for the connections to change;
// where a loop ran no passes and some other step was not reached, it says the
// loop's steps are not the ones owed.
//
// **A split judge shows both readings (t477).** Lane C round 10
// (`run-mv5uu9g1-9d80deea`, trial of rev 3) was judged by two calls that split:
// one said no, reading the start view's pagination as the read's page; the
// other said yes, reading "14 of 14 results" and no pagination in the end view.
// Only the no reached the model, which then hunted for pages that did not
// exist. An unsure trial whose calls split now carries the yes's reading too
// (`answeredReading`), beside the no's (`unconfirmedReading`), with a note
// saying neither was confirmed and how to weigh them.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioZeroPassLoopBodies } from "../../executor/graph-navigation/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import { automationStudioModelFacingControlWords, automationStudioModelFacingFailureText } from "../../llm/model-facing/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import { automationStudioTrialAbsorbedFeedback } from "./absorbed.ts";
import { automationStudioTrialCheckStepFeedback } from "./check-step.ts";
import { automationStudioTrialExecutedSteps } from "./executed-steps.ts";
import { automationStudioTrialFailureHappened } from "./happened.ts";
import { automationStudioTrialInterruptions } from "./interruptions.ts";
import { automationStudioTrialReadsFeedback } from "./reads.ts";
import { automationStudioTrialTargetOnPage } from "./target-on-page.ts";

/** The handle the domain named each pressed way out by, keyed by the client's reference (`./interruptions.ts`). */
type WayOutHandles = Readonly<Record<string, string>>;

/** What the model is told when the two judge calls split (header, t477). */
const SPLIT_NOTE = "The two judge calls disagreed and neither was confirmed: unconfirmedReading is what the call that said no compared, answeredReading what the call that said yes compared. "
  + "Weigh each by the evidence it names against this trial's own reads, steps and stored rows: a start view is the page before the Flow's first step, and a list read ran on the page its own steps reached. "
  + "Change the Flow only for what that evidence supports; where it supports the yes, test this same revision again.";

/** The most steps a feedback lists; a longer Flow says how many it left out. */
const MAX_STEPS = 40;

/** A trial's verdict for the model, from the judge's verdict on the trial run. */
export const automationStudioCandidateTrialFeedback = Object.freeze({
  /** The run did not reach its end: no judge was asked. `reads` are the run's own read accounts, as a judged trial's summary carries them. */
  executionFailed(input: { code: string; trialRunId?: string | undefined; trace?: AutomationStudioGraphExecutionTrace | undefined; graph?: AutomationStudioFlowArtifact | undefined; start: string; wayOuts?: WayOutHandles; reads?: readonly AutomationStudioResultReadAccount[] | undefined }): { verdict: AutomationStudioCandidateTrialVerdict; feedback: JsonObject } {
    const graphFailure = input.trace?.failure?.code;
    const graphEnding = graphFailure === "executor.graph.unvisited_nodes"
      ? unvisitedEnding(graphFailure, input.trace, input.graph)
      : graphFailure === "executor.graph.unmatched_route"
        ? { code: graphFailure, happened: "The last step chose a route with no matching outgoing edge.", instruction: "Connect the step's settled route to the intended next step, then resubmit and test the new revision." }
        : undefined;
    // What each list read saw, kept and rejected, as a judged trial says it (`./reads.ts`).
    const reads = automationStudioTrialReadsFeedback(input.reads, input.graph);
    return { verdict: "execution_failed", feedback: { code: input.code, ...(input.trialRunId ? { trialRunId: input.trialRunId } : {}), start: input.start, ...(graphEnding ? { graphEnding } : {}), ...(reads.length ? { reads } : {}), ...steps(input.trace, input.graph, input.wayOuts) } };
  },

  /** The judge's verdict, read as the trial gate's. */
  judged(input: { verdict: AutomationStudioBuildTestVerdict; summary: AutomationStudioRunResultSummary; trialRunId: string; trace?: AutomationStudioGraphExecutionTrace | undefined; graph?: AutomationStudioFlowArtifact | undefined; start: string; wayOuts?: WayOutHandles }): { verdict: AutomationStudioCandidateTrialVerdict; code?: string; feedback: JsonObject } {
    const judged = input.verdict;
    // What each list read saw, kept and rejected: a read that kept no rows is said as a valid outcome of its conditions (`./reads.ts`, t466).
    const reads = automationStudioTrialReadsFeedback(input.summary.reads, input.graph);
    const common: JsonObject = { trialRunId: input.trialRunId, start: input.start, stored: { rows: input.summary.totalRecordCount, refused: input.summary.totalRefusedCount, missingRequired: input.summary.totalRowsMissingRequired }, ...(reads.length ? { reads } : {}), ...steps(input.trace, input.graph, input.wayOuts) };
    if (judged.verdict === "yes") return { verdict: "yes", feedback: { ...common, judge: "The trial was judged twice to do what the instruction asks." } };
    if (judged.verdict === "no") {
      return { verdict: "no", code: "candidate.trial_judged_no", feedback: { ...common, code: "candidate.trial_judged_no", judge: compact({ expected: judged.expected, observed: judged.observed, advice: judged.advice, stillAchievable: judged.stillAchievable }), ...(judged.findings.length ? { findings: [...judged.findings] } : {}), ...(judged.fix?.length ? { fix: [...judged.fix] } : {}), ...(judged.checked?.length ? { checked: [...judged.checked] } : {}) } };
    }
    if (judged.verdict === "unknown") {
      const split = judged.answeredReading !== undefined;
      return { verdict: "unsure", code: "candidate.trial_unconfirmed", feedback: { ...common, code: "candidate.trial_unconfirmed", why: judged.why, ...(judged.unconfirmedReading ? { unconfirmedReading: compact({ ...judged.unconfirmedReading }) } : {}),
        ...(split ? { answeredReading: compact({ ...judged.answeredReading }), readings: SPLIT_NOTE } : {}) } };
    }
    return { verdict: "not_judged", code: "candidate.trial_not_judged", feedback: { ...common, code: "candidate.trial_not_judged", why: judged.why } };
  }
});

/**
 * Why a run that reached a terminal step left steps behind, and what to change
 * (header). The steps it never reached are the Flow's nodes no attempt ran;
 * those inside a loop that ran no passes are the loop's body
 * (`automationStudioZeroPassLoopBodies`).
 */
function unvisitedEnding(code: string, trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): JsonObject {
  const attempts = trace?.attempts ?? [];
  const emptyLoops = graph ? new Set(automationStudioZeroPassLoopBodies(graph, attempts)) : new Set<string>();
  if (!emptyLoops.size) {
    return { code, happened: "The run reached a terminal step while required graph nodes remained unvisited.", instruction: "Check the Flow's connections and required steps. Continue to those steps, or use an explicit End only where the instruction is complete. This is a graph-level failure; no displayed successful step needs retrying." };
  }
  const ran = new Set(attempts.map((attempt) => attempt.nodeId));
  const notReached = (graph?.nodes ?? []).filter((node) => !ran.has(node.id));
  if (notReached.every((node) => emptyLoops.has(node.id))) {
    return { code, happened: "The run ended with steps it never reached, and every one of them is inside a loop that ran no passes: the list the loop walks had no rows.",
      instruction: "A loop that runs no passes is a valid ending, not a fault in the Flow's connections: do not rewire it. If the request wants rows the list did not keep, a condition of the read that made the list is wrong; reads says what each read kept and what each condition rejected." };
  }
  return { code, happened: "The run reached a terminal step while required graph nodes remained unvisited. A loop in this run ran no passes, because the list it walks had no rows; the steps inside it are not the ones the run still owed.",
    instruction: "Check the connections to the steps outside that loop that the run never reached. Continue to those steps, or use an explicit End only where the instruction is complete. No displayed successful step needs retrying." };
}

/**
 * Each step that ran, in order: its definition, the control it acted on, its
 * final status, how many attempts it took, what it absorbed on the way
 * (`./absorbed.ts`) and, for a failure, what happened. Then the paces the run
 * learned, once each.
 */
function steps(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined, wayOuts: WayOutHandles | undefined): JsonObject {
  const ran = automationStudioTrialExecutedSteps(trace?.attempts ?? []);
  if (!ran.length) return { steps: [] };
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const listed = ran.slice(0, MAX_STEPS).map(({ attempt, attempts, absorbed, pass }, index) => {
    const node = nodes.get(attempt.nodeId);
    const failure = attempt.failure;
    const control = automationStudioModelFacingControlWords(node?.parameterValues);
    // A control the step could not find where it was saved, though the domain measured one like it on the page (t420).
    const onPage = failure && !attempt.stateHeld ? automationStudioTrialTargetOnPage({ step: index + 1, node, control, attempt, earlier: absorbed.map((entry) => entry.failed) }) : undefined;
    const step = compact({
      step: index + 1, definitionId: attempt.definitionId, label: node?.label, control, status: automationStudioAttemptSettled(attempt).status,
      attempts: attempts > 1 ? attempts : undefined,
      ...(attempt.skipped ? { skipped: skippedSaid(attempt.skipped) } : {}),
      // Done, though its try failed: the page already showed what the step does (`stateHeld`).
      ...(attempt.stateHeld ? { stateHeld: "The step's try failed, but the page already showed what the step does, so the run went on without doing it again." } : {}),
      failureCode: failure?.code, happened: failure ? automationStudioTrialFailureHappened(failure.category) : undefined,
      ...(failure ? automationStudioModelFacingFailureText(failure) : {})
    });
    // What the run closed over the page while the step ran, and the handle of the way out it pressed when the domain named one (t470).
    const interruptions = automationStudioTrialInterruptions([...absorbed.map((entry) => entry.failed), attempt], wayOuts);
    const told = { ...step, ...(absorbed.length ? { absorbed: automationStudioTrialAbsorbedFeedback({ absorbed, pass, targetOnPage: onPage !== undefined }) } : {}), ...(interruptions.length ? { interruptions } : {}) };
    // A step whose state already held is done: no retry or check advice for a failure the run went past.
    return failure && !attempt.stateHeld ? { ...told, retryable: failure.retryable === true, ...automationStudioTrialCheckStepFeedback(node, attempt), ...onPage } : told;
  });
  const paces = learnedPaces(trace, nodes);
  return { steps: listed, ...(ran.length > MAX_STEPS ? { stepsLeftOut: ran.length - MAX_STEPS } : {}), ...(paces.length ? { paces } : {}) };
}

/**
 * Why a step was passed over, in one sentence. A step that does a lasting act
 * and was passed over says the act was not done, never only that it was
 * skipped (r4b F4, `../../executor/step-skip/act-not-done.ts`).
 */
function skippedSaid(skipped: NonNullable<AutomationStudioNodeAttemptTrace["skipped"]>): string {
  if (skipped.reason !== "target_absent") return "The page was already at another step, so the run went on from there.";
  return skipped.notDone
    ? "Its control was not on the page, so the step was skipped and what it does was not done. If the instruction asks for it, the step must not be optional."
    : "Its control was not on the page, so the step was skipped.";
}

/** Each pace the run learned from a site asking it to slow down, with the step it holds, said once. */
function learnedPaces(trace: AutomationStudioGraphExecutionTrace | undefined, nodes: ReadonlyMap<string, AutomationStudioFlowNode>): JsonObject[] {
  return (trace?.pace ?? []).filter((pace) => pace.learnedMs !== undefined).map((pace) => {
    const node = nodes.get(pace.nodeId);
    return compact({ definitionId: node?.definitionId, label: node?.label, control: automationStudioModelFacingControlWords(node?.parameterValues), paceMs: pace.paceMs,
      said: `The run learned to start this step at most once every ${(pace.paceMs / 1_000).toFixed(1)} s after the site asked it to slow down${pace.raisedCount > 1 ? ` ${pace.raisedCount} times` : ""}, and held every later pass to it.` });
  });
}

function compact(value: Record<string, string | number | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ""));
}
