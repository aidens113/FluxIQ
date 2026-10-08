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
// **A failed check says what it waited for (t368).** A failed wait or assert
// adds what it waited for, whether the domain found that text hidden or absent,
// the visible text most like it, and that a check which only confirms the act
// before it is not needed (`./check-step.ts`, from lane A round 7). The
// snippets are page text the extension screened by its sensitive-value rules
// before they left the browser, bounded again here.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import { automationStudioTrialCheckStepFeedback } from "./check-step.ts";

/** The most steps a feedback lists; a longer Flow says how many it left out. */
const MAX_STEPS = 40;

/** A trial's verdict for the model, from the judge's verdict on the trial run. */
export const automationStudioCandidateTrialFeedback = Object.freeze({
  /** The run did not reach its end: no judge was asked. */
  executionFailed(input: { code: string; trialRunId?: string | undefined; trace?: AutomationStudioGraphExecutionTrace | undefined; graph?: AutomationStudioFlowArtifact | undefined; start: string }): { verdict: AutomationStudioCandidateTrialVerdict; feedback: JsonObject } {
    return { verdict: "execution_failed", feedback: { code: input.code, ...(input.trialRunId ? { trialRunId: input.trialRunId } : {}), start: input.start, ...steps(input.trace, input.graph) } };
  },

  /** The judge's verdict, read as the trial gate's. */
  judged(input: { verdict: AutomationStudioBuildTestVerdict; summary: AutomationStudioRunResultSummary; trialRunId: string; trace?: AutomationStudioGraphExecutionTrace | undefined; graph?: AutomationStudioFlowArtifact | undefined; start: string }): { verdict: AutomationStudioCandidateTrialVerdict; code?: string; feedback: JsonObject } {
    const judged = input.verdict;
    const common: JsonObject = { trialRunId: input.trialRunId, start: input.start, stored: { rows: input.summary.totalRecordCount, refused: input.summary.totalRefusedCount, missingRequired: input.summary.totalRowsMissingRequired }, ...steps(input.trace, input.graph) };
    if (judged.verdict === "yes") return { verdict: "yes", feedback: { ...common, judge: "The trial was judged twice to do what the instruction asks." } };
    if (judged.verdict === "no") {
      return { verdict: "no", code: "candidate.trial_judged_no", feedback: { ...common, code: "candidate.trial_judged_no", judge: compact({ expected: judged.expected, observed: judged.observed, advice: judged.advice, stillAchievable: judged.stillAchievable }), ...(judged.findings.length ? { findings: [...judged.findings] } : {}), ...(judged.fix?.length ? { fix: [...judged.fix] } : {}), ...(judged.checked?.length ? { checked: [...judged.checked] } : {}) } };
    }
    if (judged.verdict === "unknown") {
      return { verdict: "unsure", code: "candidate.trial_unconfirmed", feedback: { ...common, code: "candidate.trial_unconfirmed", why: judged.why, ...(judged.unconfirmedReading ? { unconfirmedReading: compact({ ...judged.unconfirmedReading }) } : {}) } };
    }
    return { verdict: "not_judged", code: "candidate.trial_not_judged", feedback: { ...common, code: "candidate.trial_not_judged", why: judged.why } };
  }
});

/** Each step that ran, in order: its definition, the control it acted on, its final status, how many attempts it took and, for a failure, what happened. */
function steps(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): JsonObject {
  const ran = executedSteps(trace?.attempts ?? []);
  if (!ran.length) return { steps: [] };
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const listed = ran.slice(0, MAX_STEPS).map(({ attempt, attempts }, index) => {
    const node = nodes.get(attempt.nodeId);
    const failure = attempt.failure;
    const step = compact({
      step: index + 1, definitionId: attempt.definitionId, label: node?.label, control: controlWords(node?.parameterValues), status: attempt.status,
      attempts: attempts > 1 ? attempts : undefined,
      ...(attempt.skipped ? { skipped: attempt.skipped.reason === "target_absent" ? "Its control was not on the page, so the step was skipped." : "The page was already at another step, so the run went on from there." } : {}),
      failureCode: failure?.code, happened: failure ? HAPPENED[failure.category] ?? HAPPENED.action_failed : undefined,
      expected: failure?.expected, actual: failure?.actual
    });
    return failure ? { ...step, retryable: failure.retryable === true, ...automationStudioTrialCheckStepFeedback(node, attempt) } : step;
  });
  return { steps: listed, ...(ran.length > MAX_STEPS ? { stepsLeftOut: ran.length - MAX_STEPS } : {}) };
}

/**
 * The trace's attempts folded into steps (t365). Since t355 a node may make up
 * to four attempts, recorded one after another; lane A round 5
 * (`run-muz0f12h-eae63685`) listed a busy refusal and its successful retry as a
 * failed step and a new one. An attempt of the same node right after a failed
 * attempt of it is that step tried again, so it replaces the step's outcome and
 * adds to its count; a node reached again after it succeeded (a loop, a
 * route back) is a new step.
 */
function executedSteps(attempts: readonly AutomationStudioNodeAttemptTrace[]): Array<{ attempt: AutomationStudioNodeAttemptTrace; attempts: number }> {
  const folded: Array<{ attempt: AutomationStudioNodeAttemptTrace; attempts: number }> = [];
  for (const attempt of attempts) {
    const last = folded.at(-1);
    if (last && last.attempt.nodeId === attempt.nodeId && last.attempt.status === "failed") folded[folded.length - 1] = { attempt, attempts: last.attempts + 1 };
    else folded.push({ attempt, attempts: 1 });
  }
  return folded;
}

/** Core's plain sentence for each failure category (`@fluxiq/contracts` `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES`). */
const HAPPENED: Readonly<Record<string, string>> = Object.freeze({
  action_failed: "The step ran and did not work.",
  expected_state_missing: "The step ran, but what it should have changed was not seen.",
  unexpected_state: "The step ended somewhere other than expected.",
  timeout: "The step, or the wait for its result, ran out of time.",
  blocked_by_capability_or_policy: "A permission or policy refused the step.",
  missing_router_or_subflow_target: "The step named a route or Subflow that does not exist.",
  graph_validation_or_unknown_node: "The step names a node that cannot run.",
  external_side_effect_denied: "The step needed a lasting act it is not permitted to do.",
  ambiguous_or_unknown: "The step failed for a reason the page did not make clear.",
  target_not_found: "The step's control was not found on the page.",
  target_ambiguous: "More than one control matched the step's control, and none could be chosen.",
  navigation_unexpected: "The page went somewhere the step did not ask for, or did not reach where it asked to go.",
  output_not_observed: "The step reported success, but its effect was never seen.",
  page_changed: "The page changed under the step before it could act.",
  auth_required: "The site asked to sign in before the step could go on.",
  user_intervention_required: "The page needs a person before the step can go on."
});

/** The words of the element a node targets, from the identity its handle resolved to at submission (`parameters.element`). */
function controlWords(parameters: JsonObject | undefined): string | undefined {
  const element = parameters?.element;
  if (!element || typeof element !== "object" || Array.isArray(element)) return undefined;
  const words = [element.accessibleName, element.visibleText].find((value): value is string => typeof value === "string" && value.trim() !== "");
  return words?.replace(/\s+/gu, " ").trim();
}

function compact(value: Record<string, string | number | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ""));
}
