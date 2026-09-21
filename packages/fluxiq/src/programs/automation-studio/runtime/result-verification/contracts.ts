// What a run's result is judged to be, and the bounded account of the result
// that the judgement is made from.
//
// FluxIQ had no check at all that a finished run answered what was asked. A run
// failed only when a step failed, so four separate live runs on 2026-09-17 each
// reported success while returning the wrong thing: a catalogue that returned
// none of its eight records, a catalogue whose every row was refused by record
// validation, a feed that returned ten of forty entries, and a request for two
// matching records that returned all two hundred and forty because the built
// Flow had no filtering step in it. Nothing failed, so nothing was reported.
// The test facility caught all four only because it holds a written answer key,
// and a person running their own automation has no answer key.
//
// The vocabulary here is deliberately about a *result*, not about a step. A
// record and a column are domain-neutral -- a row of values with named fields
// is what any medium's extraction produces -- and nothing in this file knows
// where the values came from.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../core/index.ts";
// The bounds live in `runtime/loop-limits/`, which neither this directory nor
// the harness owns, and are re-exported here so a reader of the contract has
// them in hand. See that module for why they are not declared here.
export { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS } from "../loop-limits/index.ts";

/**
 * The verdict on whether a finished run's result answers the request.
 *
 * Three words, because two would force a model with no view to guess. `unsure`
 * exists so that "I cannot tell" is sayable, and it is emphatically not a pass:
 * `automationStudioResultVerificationAnswers` is the one reader of these
 * values, and only `answers` passes. What any other verdict does to the run
 * is `automationStudioResultVerificationFailsRun`'s to say: it fails the run
 * unless two checks of the same result did not settle it.
 */
export type AutomationStudioResultVerdict = "answers" | "does_not_answer" | "unsure";

/** How a verdict was reached. Recorded so a reader can tell a judgement from an unanswered question. */
export type AutomationStudioResultVerdictBasis =
  /** Core's own arithmetic over the result reached it; no model was asked. */
  | "core_observation"
  /** The model was asked and answered. */
  | "model"
  /** The model was asked and its answer carried no verdict. */
  | "model_silent"
  /** The call was made or attempted and did not come back usable. */
  | "model_unavailable"
  /**
   * The model judged the result not to answer, or could not tell, was asked
   * once more with the same evidence, and judged that it does. Two different
   * answers to one question settle nothing, so neither is taken over the other.
   */
  | "model_disagreed"
  /**
   * The model was asked twice with the same evidence and never judged that the
   * result answers, nor twice that it does not: `no` then `unknown`,
   * `unknown` then `no` or `unknown`, or a second call that gave no answer.
   * That is not proof the run failed.
   */
  | "model_unconfirmed";

/** One record set the run stored, as the verification reads it. */
export type AutomationStudioResultRecordSetSummary = {
  datasetId: string;
  label?: string;
  /** Rows stored. Zero is the finding that produced this module. */
  recordCount: number;
  /** Rows the record schema refused. Every row refused leaves `recordCount` zero. */
  refusedCount: number;
  /** True when the run returned more rows than the record output keeps. */
  truncated: boolean;
  /** The stored schema's field ids, in schema order, bounded by `maxColumns`. */
  columns: string[];
  /** True when the column list was cut. */
  columnsWithheld: boolean;
  /**
   * Stored rows Core read back for its own required-value check: at most
   * `maxRowsCheckedPerSet`, so fewer than `recordCount` on a large set, and 0
   * when the set's rows or its schema could not be read.
   */
  rowsChecked: number;
  /** Of `rowsChecked`, the rows carrying no value for a field the set's own schema declares required. */
  rowsMissingRequired: number;
  /** The required field ids some checked row lacked, in schema order, bounded by `maxColumns`. Ids, never values. */
  missingRequiredColumns: string[];
  /** A few stored rows, each value bounded. Absent when the set stored none. */
  sampleRows?: JsonObject[];
};

/**
 * The bounded account of what a run produced, and of the shape of the Flow that
 * produced it.
 *
 * The Flow's shape is here because one of the four measured failures is only
 * visible in it: a request for the records matching a description produced a
 * Flow that navigated, extracted and ended, with no step that narrows anything,
 * so returning every record was the only thing it could ever do. Definition ids
 * and node ids are the same identifiers a run's recent actions already carry.
 */
export type AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1";
  /** Rows stored across every record set, including the ones not summarized. */
  totalRecordCount: number;
  /** Rows refused across every record set. */
  totalRefusedCount: number;
  /** Checked rows lacking a required value, across every record set summarized. */
  totalRowsMissingRequired: number;
  /** Record sets the run stored, including the ones not summarized. */
  recordSetCount: number;
  recordSets: AutomationStudioResultRecordSetSummary[];
  /** The steps the Flow is built from, in authored order: what it can do at all. */
  flowShape: Array<{ nodeId: string; definitionId: string }>;
  /** True when a record set, a row sample, a column list or the Flow shape was cut to fit. */
  withheld: boolean;
};

/** The verdict, the reason a person reads, and the observation behind it. */
export type AutomationStudioResultVerification = {
  schemaVersion: "automation-studio.result-verification.v1";
  verdict: AutomationStudioResultVerdict;
  basis: AutomationStudioResultVerdictBasis;
  /** Core's stable code for why this verdict was reached. */
  code: string;
  /** Why, in a sentence, in Core's own words. */
  reason: string;
  /** What was actually observed: counts, never a model's prose or a row's contents. */
  observation: string;
  /**
   * The verdict each verification call returned, in the order asked: one, or
   * two when the first answered anything but `answers`. Verdict words only,
   * never the model's prose. Absent when no model was asked.
   */
  verdicts?: AutomationStudioResultVerdict[];
  /** The verification calls made or attempted: 1 or 2. Absent when no model was asked. */
  calls?: number;
  /**
   * Present exactly when the verification fails the run
   * (`automationStudioResultVerificationFailsRun`): what the run must report.
   */
  failure?: AutomationStudioFailureRecord;
};

/**
 * Why a run was not verified at all.
 *
 * This is not a verdict and must never be read as one. A run that produces no
 * records has no result to judge, and a deployment with no model configured
 * cannot ask for a judgement -- neither is the model saying "it looks fine".
 * Recording the reason is what keeps the two apart on a run's record.
 */
export type AutomationStudioResultVerificationSkipped = {
  schemaVersion: "automation-studio.result-verification.v1";
  performed: false;
  code: string;
  reason: string;
};

/** What a finished run's verification produced: a verdict, or a stated reason there is none. */
export type AutomationStudioResultVerificationOutcome =
  | (AutomationStudioResultVerification & { performed: true })
  | AutomationStudioResultVerificationSkipped;

/**
 * Whether a verification lets a run keep reporting success.
 *
 * The single reader of a verdict, and the whole of the fail-closed rule: only
 * `answers` passes. `unsure` fails here, and it must, because the failure this
 * module exists to catch is precisely a run that reported success while nobody
 * had checked. A verification that was never performed is not a verdict and
 * never reaches this function.
 */
export function automationStudioResultVerificationAnswers(verification: AutomationStudioResultVerification): boolean {
  return verification.verdict === "answers";
}

/**
 * Whether a verification fails the run it judged.
 *
 * Every verdict but `answers` does, fail-closed, with one exception: a result
 * the model was asked about twice, with the same evidence, without either
 * saying `yes` twice or `no` twice (`model_disagreed`, `model_unconfirmed`).
 * Both `no` and `unknown` were measured to flip on identical rows at
 * temperature 0 (2026-09-18, 2026-09-21), and failing a run whose every step
 * succeeded on an answer the model does not repeat is the false failure this
 * exception exists to stop. Such a result is recorded `unverified`, never
 * `confirmed`.
 */
export function automationStudioResultVerificationFailsRun(verification: AutomationStudioResultVerification): boolean {
  if (automationStudioResultVerificationAnswers(verification)) return false;
  return verification.basis !== "model_disagreed" && verification.basis !== "model_unconfirmed";
}
