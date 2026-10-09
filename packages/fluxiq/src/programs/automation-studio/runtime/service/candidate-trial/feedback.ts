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
//
// **A step says what it got past (t378).** A refusal the run waited out and
// tried again is no longer folded into `attempts: 2` alone: the step lists it
// under `absorbed` (`./absorbed.ts`), and the paces the run learned from a site
// asking it to slow down are said once under `paces`.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import { automationStudioTrialAbsorbedFeedback } from "./absorbed.ts";
import { automationStudioTrialCheckStepFeedback } from "./check-step.ts";
import { automationStudioTrialFailureHappened } from "./happened.ts";

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

/**
 * Each step that ran, in order: its definition, the control it acted on, its
 * final status, how many attempts it took, what it absorbed on the way
 * (`./absorbed.ts`) and, for a failure, what happened. Then the paces the run
 * learned, once each.
 */
function steps(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): JsonObject {
  const ran = executedSteps(trace?.attempts ?? []);
  if (!ran.length) return { steps: [] };
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const listed = ran.slice(0, MAX_STEPS).map(({ attempt, attempts, absorbed, pass }, index) => {
    const node = nodes.get(attempt.nodeId);
    const failure = attempt.failure;
    const step = compact({
      step: index + 1, definitionId: attempt.definitionId, label: node?.label, control: controlWords(node?.parameterValues), status: attempt.status,
      attempts: attempts > 1 ? attempts : undefined,
      ...(attempt.skipped ? { skipped: attempt.skipped.reason === "target_absent" ? "Its control was not on the page, so the step was skipped." : "The page was already at another step, so the run went on from there." } : {}),
      failureCode: failure?.code, happened: failure ? automationStudioTrialFailureHappened(failure.category) : undefined,
      expected: failure?.expected, actual: failure?.actual
    });
    const withAbsorbed = absorbed.length ? { ...step, absorbed: automationStudioTrialAbsorbedFeedback({ absorbed, pass }) } : step;
    return failure ? { ...withAbsorbed, retryable: failure.retryable === true, ...automationStudioTrialCheckStepFeedback(node, attempt) } : withAbsorbed;
  });
  const paces = learnedPaces(trace, nodes);
  return { steps: listed, ...(ran.length > MAX_STEPS ? { stepsLeftOut: ran.length - MAX_STEPS } : {}), ...(paces.length ? { paces } : {}) };
}

/** Each pace the run learned from a site asking it to slow down, with the step it holds, said once. */
function learnedPaces(trace: AutomationStudioGraphExecutionTrace | undefined, nodes: ReadonlyMap<string, AutomationStudioFlowNode>): JsonObject[] {
  return (trace?.pace ?? []).filter((pace) => pace.learnedMs !== undefined).map((pace) => {
    const node = nodes.get(pace.nodeId);
    return compact({ definitionId: node?.definitionId, label: node?.label, control: controlWords(node?.parameterValues), paceMs: pace.paceMs,
      said: `The run learned to start this step at most once every ${(pace.paceMs / 1_000).toFixed(1)} s after the site asked it to slow down${pace.raisedCount > 1 ? ` ${pace.raisedCount} times` : ""}, and held every later pass to it.` });
  });
}

type ExecutedStep = {
  attempt: AutomationStudioNodeAttemptTrace;
  attempts: number;
  /** Each failed attempt the step was tried again after, with the attempt that followed it. */
  absorbed: Array<{ failed: AutomationStudioNodeAttemptTrace; retry: AutomationStudioNodeAttemptTrace }>;
  /** The outputs of the loop pass the step ran in, when it ran in one. */
  pass?: AutomationStudioNodeAttemptTrace["outputs"] | undefined;
};

/**
 * The trace's attempts folded into steps (t365). Since t355 a node may make up
 * to four attempts, recorded one after another; lane A round 5
 * (`run-muz0f12h-eae63685`) listed a busy refusal and its successful retry as a
 * failed step and a new one. An attempt of the same node right after a failed
 * attempt of it is that step tried again, so it replaces the step's outcome and
 * adds to its count; a node reached again after it succeeded (a loop, a
 * route back) is a new step. The attempts folded away are kept (t378): what the
 * step absorbed is what the model needs to slow a loop down.
 */
function executedSteps(attempts: readonly AutomationStudioNodeAttemptTrace[]): ExecutedStep[] {
  const folded: ExecutedStep[] = [];
  let pass: ExecutedStep["pass"];
  for (const attempt of attempts) {
    const last = folded.at(-1);
    if (last && last.attempt.nodeId === attempt.nodeId && last.attempt.status === "failed") {
      folded[folded.length - 1] = { ...last, attempt, attempts: last.attempts + 1, absorbed: [...last.absorbed, { failed: last.attempt, retry: attempt }] };
      continue;
    }
    folded.push({ attempt, attempts: 1, absorbed: [], ...(pass ? { pass } : {}) });
    if (LOOP_DEFINITION_IDS.has(attempt.definitionId)) pass = attempt.route === "body" ? attempt.outputs : undefined;
  }
  return folded;
}

/** The nodes whose `body` passes a step can run in, as the executor keys them. */
const LOOP_DEFINITION_IDS: ReadonlySet<string> = new Set(["builtin.control.for-each", "builtin.control.repeat"]);

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
