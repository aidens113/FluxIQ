// The model's answer, turned into a verdict, and the rule that it fails closed.
//
// The whole of the fail-closed rule is one sentence: only `yes` passes. An
// `unknown`, an omitted field, a reply that carried no diagnosis object, and a
// call that never came back usable are all the same fact -- nobody confirmed
// that the run's result answers the request -- and a run that reports success
// on that basis is exactly the failure this module was built for. The recovery
// verdict draws the same line for a change: `unverifiable` is not `verified`,
// and the change is not promoted on the strength of nothing.
//
// What is recorded is Core's own words. The model's prose is its reading of a
// medium whose contents Core deliberately does not store, so a run record that
// quoted it back would be a copy of that medium in storage under another name
// -- the rule `structured-diagnosis.ts` states and follows. So the reason and
// the observation written onto a run here are composed from Core's counts and
// the verdict word, and the model's `expected`, `observed` and `changed` stay
// where every other diagnosis leaves them: unrecorded.

import type { AutomationStudioLlmDiagnosisFields } from "../llm/index.ts";
import {
  type AutomationStudioResultVerdict,
  type AutomationStudioResultVerdictBasis,
  type AutomationStudioResultVerification,
  type AutomationStudioRunResultSummary
} from "./contracts.ts";
import { automationStudioResultFailureRecord } from "./core-observation.ts";

/**
 * Steps named in the one-line observation. The whole shape goes to the model;
 * this is the part a person reads on a failed run, and the failure record it
 * lands in bounds its own text.
 */
const MAX_OBSERVED_STEPS = 12;

/** Core's codes for a verdict a model call reached, or failed to. */
export const AUTOMATION_STUDIO_RESULT_VERDICT_CODES = Object.freeze({
  answers: "core.result.answers_request",
  doesNotAnswer: "core.result.does_not_answer_request",
  unsure: "core.result.verdict_unsure",
  silent: "core.result.verdict_absent",
  unavailable: "core.result.verdict_unavailable"
} as const);

/** The verdict a model's `answersRequest` field carries, with anything else read as `unsure`. */
export function automationStudioResultVerdictFromDiagnosis(diagnosis: AutomationStudioLlmDiagnosisFields | undefined): AutomationStudioResultVerdict {
  if (diagnosis?.answersRequest === "yes") return "answers";
  if (diagnosis?.answersRequest === "no") return "does_not_answer";
  return "unsure";
}

export type AutomationStudioResultVerdictInput = {
  summary: AutomationStudioRunResultSummary;
  /** The diagnosis fields the verification call returned, when it returned any. */
  diagnosis?: AutomationStudioLlmDiagnosisFields | undefined;
  /** How the verdict was reached: `model` when a reply arrived, otherwise why not. */
  basis: Exclude<AutomationStudioResultVerdictBasis, "core_observation">;
  /** The diagnostic code of a call that did not come back usable. Codes only, never a message. */
  failureCode?: string | undefined;
};

/**
 * The verification a model call produces.
 *
 * `answers` is the only outcome that lets a run keep reporting success, and it
 * is reachable only from an explicit `yes`. Everything else carries a failure
 * record, so the run says what happened rather than saying nothing.
 */
export function automationStudioResultVerdict(input: AutomationStudioResultVerdictInput): AutomationStudioResultVerification {
  const codes = AUTOMATION_STUDIO_RESULT_VERDICT_CODES;
  const observation = automationStudioResultObservation(input.summary);
  if (input.basis === "model_unavailable") {
    return failed("unsure", "model_unavailable", codes.unavailable, `The run's result was never judged: the verification call did not come back usable${input.failureCode ? ` (${input.failureCode})` : ""}. A result nobody checked is not a result that answers.`, observation);
  }
  const verdict = automationStudioResultVerdictFromDiagnosis(input.diagnosis);
  if (verdict === "answers") {
    return {
      schemaVersion: "automation-studio.result-verification.v1",
      verdict,
      basis: "model",
      code: codes.answers,
      reason: "The result was judged to answer the request.",
      observation
    };
  }
  if (verdict === "does_not_answer") {
    return failed(verdict, "model", codes.doesNotAnswer, "The result was judged not to answer the request the Flow was built for, although every step of the run succeeded.", observation);
  }
  const silent = input.basis === "model_silent" || input.diagnosis?.answersRequest === undefined;
  return silent
    ? failed(verdict, "model_silent", codes.silent, "The verification call answered without saying whether the result answers the request, so nothing confirmed it.", observation)
    : failed(verdict, "model", codes.unsure, "The verification call could not tell whether the result answers the request, so nothing confirmed it.", observation);
}

/**
 * Core's account of what the run produced, in one line.
 *
 * Counts and shape only. It is the observation behind every verdict, model or
 * not, so a person reading a failed run is told what was actually there rather
 * than only that something was judged wrong.
 */
export function automationStudioResultObservation(summary: AutomationStudioRunResultSummary): string {
  const stored = `${summary.totalRecordCount} record${summary.totalRecordCount === 1 ? "" : "s"} stored`;
  const refused = summary.totalRefusedCount > 0 ? `, ${summary.totalRefusedCount} refused by record validation` : "";
  const sets = `, across ${summary.recordSetCount} record set${summary.recordSetCount === 1 ? "" : "s"}`;
  const listed = summary.flowShape.slice(0, MAX_OBSERVED_STEPS).map((step) => step.definitionId);
  const rest = summary.flowShape.length > listed.length ? `, and ${summary.flowShape.length - listed.length} more` : "";
  const shape = listed.length > 0 ? `; the Flow's steps were ${listed.join(", ")}${rest}` : "";
  const cut = summary.withheld ? "; part of the summary was withheld to fit the call" : "";
  return `${stored}${refused}${sets}${shape}${cut}.`;
}

function failed(
  verdict: AutomationStudioResultVerdict,
  basis: AutomationStudioResultVerdictBasis,
  code: string,
  reason: string,
  observation: string
): AutomationStudioResultVerification {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    verdict,
    basis,
    code,
    reason,
    observation,
    failure: automationStudioResultFailureRecord({ verdict, code, observation })
  };
}
