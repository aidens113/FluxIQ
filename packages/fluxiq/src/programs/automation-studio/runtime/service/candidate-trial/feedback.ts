// What the model is told about a trial, and the verdict it is bound to.
//
// Bounded JSON, written from Core's own codes and the judge's reading: which
// step failed and how (its failure code, never its message, which can quote
// the page), what the run stored, and what the judge expected and observed.
// Exploration evidence is never in it: the trial gate's contract
// (`../../flow-bootstrap/candidate/contracts.ts`) says the feedback is about
// the trial alone.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioBuildTestVerdict, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";

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

/** Each step that ran, in order: its definition, status and failure code. */
function steps(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): JsonObject {
  const attempts = trace?.attempts ?? [];
  if (!attempts.length) return { steps: [] };
  const labels = new Map((graph?.nodes ?? []).map((node) => [node.id, node.label]));
  const listed = attempts.slice(0, MAX_STEPS).map((attempt, index) => compact({
    step: index + 1, definitionId: attempt.definitionId, label: labels.get(attempt.nodeId), status: attempt.status, failureCode: attempt.failure?.code
  }));
  return { steps: listed, ...(attempts.length > MAX_STEPS ? { stepsLeftOut: attempts.length - MAX_STEPS } : {}) };
}

function compact(value: Record<string, string | number | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ""));
}
