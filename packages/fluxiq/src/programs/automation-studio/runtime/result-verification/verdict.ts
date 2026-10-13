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
// What is recorded on a run is Core's own words. The model's prose is its reading
// of a medium whose contents Core deliberately does not store, so a run record
// that quoted it back would be a copy of that medium in storage under another
// name -- the rule `structured-diagnosis.ts` states and follows. So the reason
// and the observation written onto a run here are composed from Core's counts and
// the verdict word.
//
// **A refutation now also carries what to fix, and the rule above survives it.**
// The user's instruction of 2026-09-26 is that the judgement give explicit
// instructions on what to fix and suggest how, because a verdict and a code sent
// the repair back to rediscover the defect from scratch. So a refutation carries
// `repair`: Core's findings and Core's fix lines, and the model's reading of the
// request screened by the two screens every request passes. The split the rule
// asks for is kept -- `run-outcome.ts` records the Core half onto the run, and
// the model's half travels only into the failure record's `expected` and
// `actual`, which is the field a domain's own sentences have always travelled in
// (`llm/harness/locator-text.ts`). What stays unrecorded is prose in a run's
// metadata; what a failure record says about its own failure is not that.
//
// **A yes has to account for the rows that name the asked item** (live run
// `run-muw60j7c-bb7c9a62`, debug C-2). Both build-test judges answered yes over
// three pairs of earbuds the name condition alone had left out, each "with
// Wireless Charging Case", though the judge's instructions said an item sold
// with an excluded part is still the item. Core flags such rows on the judge's
// copy of the summary (`request-rows/`, `leftOutNamingTheItem`), and a yes that
// does not name each of them -- by a label prefix that tells it apart from the
// rest of its read, or by an id from it -- is not taken: it becomes
// `does_not_answer`, carrying Core's finding and fix line with the condition,
// the item and the rows, so the repair has the rows themselves. It keeps the
// wrong-answer code, which is what routes a run to its re-author
// (`recovery/refuted-result/reauthor.ts`), and counts as a no in the pair rules
// (`agreement.ts`) and in a build's test (`build-test/judge.ts`).
//
// **And a no's named rows are checked against the run** (debug C-5). The result
// judges said the Plus condition "alone excluded" B0J5MCMBAY and B07Z1RZGJG; both
// are in the stored result, and the re-author followed that reading and threw
// away the answer it held. So a refutation carries `repair.checked`: Core's lines
// on each row the judgement names, in Core's words (`request-rows/checked-rows.ts`).
//
// **And a yes over any row a condition alone left out quotes the request's own
// words that exclude it (t515).** Live run `run-mv6v2hx5-f448e662`: a request
// listed one exclusion, a revision's second condition left out a row it never
// excludes, and both build-test judges said yes, naming the row and calling it
// "an accessory". Where the caller gives the request's wording (`wording`),
// each such row has to stand in a sentence of the reply that quotes words of
// the request excluding it, and not only the words it searched by
// (`request-rows/unquoted-rows.ts`); a yes that leaves one without is not
// taken, as above, and `repair.checked` names the rows in Core's words.
//
// **A yes that says the Flow needs a change is coded so (t515).** The same
// run's playback check answered yes with `patchNeeded: true`, and the run was
// recorded confirmed. A yes stays a yes here -- a build's two yeses still finish
// it, its advice unconfirmed (`flow-bootstrap/unfinished-build/`
// `finishing-verdict.ts`, cause 10) -- but carries `answersWithChangeAdvised`,
// and a runtime check's single yes so coded is not confirmed (`agreement.ts`).

import type { AutomationStudioLlmDiagnosisFields } from "../llm/index.ts";
import {
  type AutomationStudioResultLeftOutNamingTheItem,
  type AutomationStudioResultRepairDirective,
  type AutomationStudioResultVerdict,
  type AutomationStudioResultVerdictBasis,
  type AutomationStudioResultVerification,
  type AutomationStudioRunResultSummary
} from "./contracts.ts";
import { automationStudioResultFailureRecord } from "./core-observation.ts";
import { automationStudioResultReadSentence } from "./read-account/index.ts";
import { automationStudioResultScreenedJudgement } from "./judgement-screen.ts";
import { automationStudioResultRepairDirective } from "./repair-directive.ts";
import {
  automationStudioResultCheckedRows,
  automationStudioResultLeftOutRowsUnaccounted,
  automationStudioResultLeftOutRowsUnquoted,
  automationStudioResultLeftOutStatingAKeptNumber,
  type AutomationStudioRequestRowsKeptNumberLeftOut,
  type AutomationStudioRequestRowsUnquoted,
  type AutomationStudioRequestWording
} from "./request-rows/index.ts";

/**
 * Core's codes for a verdict a model call reached, or failed to. The last two
 * are for a first answer other than `yes` that a second call with the same
 * evidence did not settle (`agreement.ts`): one of the two said `yes`, or
 * neither did and they did not both say `no`.
 */
export const AUTOMATION_STUDIO_RESULT_VERDICT_CODES = Object.freeze({
  answers: "core.result.answers_request",
  /** A yes whose same reply said the Flow needs a change (`patchNeeded: true`, header): not confirmed as a runtime check's single yes (`agreement.ts`). */
  answersWithChangeAdvised: "core.result.answers_with_change_advised",
  doesNotAnswer: "core.result.does_not_answer_request",
  unsure: "core.result.verdict_unsure",
  silent: "core.result.verdict_absent",
  unavailable: "core.result.verdict_unavailable",
  disagree: "core.result.verdicts_disagree",
  unconfirmed: "core.result.refutation_unconfirmed"
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
  /**
   * The reply's own prose summary, read only as the judgement's advice and only
   * where `diagnosis.changed` gave none.
   *
   * It is the field a model fills without being told which of them to fill, so a
   * judgement that put its whole reading in the summary is not thrown away for
   * having chosen the wrong box. Nothing is required of it: absent, empty or
   * unusable, the refutation stands on Core's own findings.
   */
  summaryText?: string | undefined;
  /** How the verdict was reached: `model` when a reply arrived, otherwise why not. */
  basis: Exclude<AutomationStudioResultVerdictBasis, "core_observation" | "model_disagreed" | "model_unconfirmed">;
  /**
   * The diagnostic code of a call that did not come back usable. Codes only,
   * never a message. Kept on the verification as `failureCode`; the reason a
   * person reads says what happened in words instead.
   */
  failureCode?: string | undefined;
  /**
   * The request as the judge read it (`request-rows/request-wording.ts`): where
   * given, a yes over a row a condition alone left out has to quote, beside
   * that row, the request's own words that exclude it (header, t515). Absent,
   * a yes is read as before.
   */
  wording?: AutomationStudioRequestWording | undefined;
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
    // The reason is said in the chat, so it names what happened in words; the
    // exact code goes on the record beside it (live run muqk713g).
    return {
      ...failed("unsure", "model_unavailable", codes.unavailable, `The run's result was never judged: ${callFailureWords(input.failureCode)}. A result nobody checked is not a result that answers.`, observation),
      ...(input.failureCode ? { failureCode: input.failureCode } : {})
    };
  }
  const verdict = automationStudioResultVerdictFromDiagnosis(input.diagnosis);
  // Rows a text condition left out though it kept their number on another row: Core's to see, whatever was judged (t478).
  const keptNumber = automationStudioResultLeftOutStatingAKeptNumber(input.summary);
  if (verdict === "answers") {
    const unaccounted = automationStudioResultLeftOutRowsUnaccounted(input.summary, replyText(input));
    const unquoted = input.wording ? withoutUnaccounted(automationStudioResultLeftOutRowsUnquoted(input.summary, replyText(input), input.wording), unaccounted) : [];
    if (unaccounted.length || keptNumber.length || unquoted.length) {
      // Core's words only: the yes's own prose argues the opposite of the verdict it now carries.
      return failed("does_not_answer", "model", codes.doesNotAnswer, refusedYesReason(unaccounted.length > 0, keptNumber.length > 0, unquoted.length > 0), observation, automationStudioResultRepairDirective({
        summary: input.summary,
        leftOutUnaccounted: unaccounted,
        leftOutKeptNumber: keptNumber,
        checked: [...unaccounted.map(unaccountedLine), ...unquoted.map(unquotedLine), ...keptNumber.map(keptNumberLine)]
      }));
    }
    // What the yes compared, screened as a no's is: a split shows it beside the no's (`./agreement.ts`, t477).
    const read = automationStudioResultScreenedJudgement({ expected: input.diagnosis?.expected, observed: input.diagnosis?.observed }).judgement;
    const answeredReading = { ...(read?.expected ? { expected: read.expected } : {}), ...(read?.observed ? { observed: read.observed } : {}) };
    return {
      schemaVersion: "automation-studio.result-verification.v1",
      verdict,
      basis: "model",
      // A yes that also said the Flow needs a change is not a clean pass (header, t515).
      code: input.diagnosis?.patchNeeded === true ? codes.answersWithChangeAdvised : codes.answers,
      reason: "The result was judged to answer the request.",
      observation,
      ...(Object.keys(answeredReading).length ? { answeredReading } : {})
    };
  }
  if (verdict === "does_not_answer") {
    return failed(verdict, "model", codes.doesNotAnswer, "The result was judged not to answer the request the Flow was built for.", observation, automationStudioResultRepairDirective({
      summary: input.summary,
      judgement: {
        ...(input.diagnosis?.expected !== undefined ? { expected: input.diagnosis.expected } : {}),
        ...(input.diagnosis?.observed !== undefined ? { observed: input.diagnosis.observed } : {}),
        // `changed` is the field the diagnosis channel already asks a model to
        // fill with its reading, and the reply's summary stands in where it left
        // it empty. Neither is required and neither is asked for twice.
        ...(advice(input) !== undefined ? { advice: advice(input) } : {}),
        // Whether what was asked can still be had: the one field a build reads
        // to end "not doable" (t195-w37, live run `run-murwcaj0-40e56557`).
        ...(input.diagnosis?.stillAchievable !== undefined ? { stillAchievable: input.diagnosis.stillAchievable } : {})
      },
      // Each row the judgement names, checked against what the run holds (live run `run-muw60j7c-bb7c9a62`, C-5).
      checked: automationStudioResultCheckedRows(input.summary, replyText(input)),
      // Core's own finding beside the judgement's: the repair has the rows whoever saw them.
      leftOutKeptNumber: keptNumber
    }));
  }
  const silent = input.basis === "model_silent" || input.diagnosis?.answersRequest === undefined;
  if (silent) return failed(verdict, "model_silent", codes.silent, "The verification call answered without saying whether the result answers the request, so nothing confirmed it.", observation);
  // What it doubted, screened as a no's reading is: an unsure beside a yes is weighed by it against Core's record (`./agreement.ts`, t503).
  const doubt = automationStudioResultScreenedJudgement({ expected: input.diagnosis?.expected, observed: input.diagnosis?.observed, advice: advice(input) }).judgement;
  return { ...failed(verdict, "model", codes.unsure, "The verification call could not tell whether the result answers the request, so nothing confirmed it.", observation), ...(doubt ? { unsureReading: doubt } : {}) };
}

/**
 * What happened to a verification call that did not come back usable, in
 * words, by its diagnostic code's family. Never the code itself: this sentence
 * is said in the chat, and the code is kept on the record as `failureCode`.
 */
function callFailureWords(code: string | undefined): string {
  if (code === undefined) return "the verification call did not come back usable";
  if (/(^|[._])aborted$|cancel/.test(code)) return "the judge's call was stopped before it answered";
  if (/timeout$/.test(code)) return "the judge ran out of time before it answered";
  if (/^llm_(budget|usage)\.|budget_exceeded$|usage_limit_exceeded$/.test(code)) return "the judge's call would have gone past its spending or size limit";
  if (/^llm_output\.|^llm\.provider_(malformed_response|output_|response_oversize|usage_invalid|result_summary_invalid)/.test(code)) return "the judge's reply could not be read";
  if (/^llm\.provider_(http_error|network_error|rate_limited|auth_failed|secret_|request_failed|request_setup_failed|redirect_rejected|model_unsupported)/.test(code)) return "the model could not be reached";
  if (/^llm\.request\.|^llm\.provider_.*(_invalid|credential_in_request)$/.test(code)) return "the judge's request could not be sent";
  return "the verification call did not come back usable";
}

/** Everything the reply said in words: its expected, observed and changed, and its summary. Read for the rows it names, never recorded. */
function replyText(input: AutomationStudioResultVerdictInput): string {
  const said = [input.diagnosis?.expected, input.diagnosis?.observed, input.diagnosis?.changed, input.summaryText];
  return said.filter((text): text is string => typeof text === "string" && text.trim().length > 0).join("\n");
}

/** Core's line for one condition's flagged rows a yes did not name, as `repair.checked` carries it to a build's repair. */
function unaccountedLine(entry: AutomationStudioResultLeftOutNamingTheItem): string {
  const where = entry.step !== undefined ? `Step ${entry.step}` : `Read ${entry.nodeId ?? "(unnamed)"}`;
  return `The check answered yes without accounting for ${entry.rows.length === 1 ? "this row" : "these rows"} the condition "${entry.condition}" (${where}) alone left out, which name "${entry.item}" first and ${entry.also.map((phrase) => `"${phrase}"`).join(", ")} only after it: ${entry.rows.join("; ")}.`;
}

/** Why a yes was not taken, by what Core found it passed over. */
function refusedYesReason(unaccounted: boolean, keptNumber: boolean, unquoted: boolean): string {
  const said = [
    ...(unaccounted ? ["without saying why the request excludes each row a condition alone left out that names the item asked for"] : []),
    ...(unquoted ? ["without quoting, beside each row a condition alone left out, words of the request that exclude it"] : []),
    ...(keptNumber ? ["over rows a text condition alone left out that state a number the same condition kept on another row"] : [])
  ];
  return `The result was judged to answer the request ${said.join(", and ")}, so it is not taken as an answer.`;
}

/**
 * Core's line for one condition's left-out rows a yes did not quote the
 * request's excluding words beside (`request-rows/unquoted-rows.ts`). Worded
 * "left out by condition", not "the condition": `request-rows/`
 * `checked-rows-named.ts` reads rows after "the condition" as rows the request
 * asks for, which a repair's rerun is then measured against; these rows are
 * only rows the yes did not account for, not rows Core says are wanted.
 */
function unquotedLine(entry: AutomationStudioRequestRowsUnquoted): string {
  const where = entry.step !== undefined ? `Step ${entry.step}` : `Read ${entry.nodeId ?? "(unnamed)"}`;
  const one = entry.rows.length === 1;
  return `The check answered yes without quoting, beside ${one ? "this row" : "each of these rows"}, words of the request that exclude ${one ? "it" : "each"}; ${one ? "it was" : "they were"} left out by condition "${entry.condition}" alone (${where}) -- ${entry.rows.join(" | ")}. A row the request's own words do not exclude is one it asks for.`;
}

/** The unquoted rows less those the named-rows check already reported for the same condition: one line per row is enough. */
function withoutUnaccounted(unquoted: AutomationStudioRequestRowsUnquoted[], unaccounted: readonly AutomationStudioResultLeftOutNamingTheItem[]): AutomationStudioRequestRowsUnquoted[] {
  return unquoted.flatMap((entry) => {
    const said = new Set(unaccounted.filter((other) => other.step === entry.step && other.nodeId === entry.nodeId && other.condition === entry.condition).flatMap((other) => other.rows));
    const rows = entry.rows.filter((row) => !said.has(row));
    return rows.length ? [{ ...entry, rows }] : [];
  });
}

/** Core's line for one text condition's left-out rows stating a number it kept, as `repair.checked` carries it to a build's repair. */
function keptNumberLine(entry: AutomationStudioRequestRowsKeptNumberLeftOut): string {
  const range = entry.low === entry.high ? String(entry.low) : `${entry.low} to ${entry.high}`;
  const rows = entry.rows.map((row, index) => `${row} (states ${entry.numbers[index]})`).join("; ");
  return `The check answered yes though the condition "${entry.condition}" (Read ${entry.nodeId}) kept rows stating ${range} and alone left out ${entry.rows.length === 1 ? "this row, which states" : "these rows, which state"} a number in that range: ${rows}.`;
}

/** The judgement's advice: what it said changed, or failing that what its reply said at all. */
function advice(input: AutomationStudioResultVerdictInput): string | undefined {
  const changed = typeof input.diagnosis?.changed === "string" && input.diagnosis.changed.trim() ? input.diagnosis.changed : undefined;
  return changed ?? (typeof input.summaryText === "string" && input.summaryText.trim() ? input.summaryText : undefined);
}

/**
 * Core's account of what the run produced, in one line.
 *
 * Counts and shape only. It is the observation behind every verdict, model or
 * not, so a person reading a failed run is told what was actually there rather
 * than only that something was judged wrong.
 */
export function automationStudioResultObservation(summary: AutomationStudioRunResultSummary): string {
  // A build's test stores nothing itself; what it is judged on is what the Flow
  // would store (`build-test/stores.ts`), and the check's card reads its count
  // off this head (`check-words.ts`). Run `run-muw60j7c-bb7c9a62` (C-3): the head
  // said "0 records stored" and the card "Passed: no rows came back" over a Flow
  // that would store 30 rows, 3 of them twice.
  const tested = summary.buildTest?.stores;
  const stored = tested ? wouldStore(tested) : `${summary.totalRecordCount} record${summary.totalRecordCount === 1 ? "" : "s"} stored`;
  const refused = summary.totalRefusedCount > 0 ? `, ${summary.totalRefusedCount} refused by record validation` : "";
  const sets = tested
    ? `, in ${tested.length} dataset${tested.length === 1 ? "" : "s"}`
    : `, across ${summary.recordSetCount} record set${summary.recordSetCount === 1 ? "" : "s"}${eachSet(summary)}`;
  // Every step, named: the observation reaches the repair, which is shown the
  // whole Flow.
  const listed = summary.flowShape.map((step) => step.definitionId);
  const shape = listed.length > 0 ? `; the Flow's steps were ${listed.join(", ")}` : "";
  const cut = summary.withheld ? "; some of it was withheld: a value secret-shaped or under a denied key, or a set the store reported truncated" : "";
  // How each read went, ahead of the step list: this line becomes the failure
  // record's `actual`, and a read's pages, stop and rejections are what a
  // repair acts on, where a definition id only says the step exists.
  const reads = (summary.reads ?? []).map((read) => `; ${automationStudioResultReadSentence(read, "brief")}`).join("");
  return `${stored}${refused}${sets}${reads}${shape}${cut}.`;
}

/**
 * Each record set's rows, when the run stored more than one and every one is
 * summarized: " (4, 4 rows)". The check's card says the answer's rows from it
 * (`check-words.ts`), never their sum: live run `run-mv5jnc5m-a47c3e59` (lane D
 * round 8) stored the 4 qualifying requests twice, once from the listing that
 * chose them and once from the read of the accepted ones, and the card said
 * "8 rows came back" of a 4-row answer.
 */
function eachSet(summary: AutomationStudioRunResultSummary): string {
  if (summary.recordSetCount < 2 || summary.recordSets.length !== summary.recordSetCount) return "";
  const distinct = distinctRows(summary);
  const same = distinct !== undefined && summary.recordSets.every((set) => set.recordCount === distinct);
  const told = distinct === undefined ? "" : same ? "; the same rows in each" : `; ${distinct} distinct`;
  return ` (${summary.recordSets.map((set) => set.recordCount).join(", ")} rows${told})`;
}

/**
 * How many distinct rows the record sets hold together, each row read by the
 * columns every set stores (t482): live run `run-mv636xyp-2e4fe54d`'s card
 * said "4 rows came back, in each of 2 record sets" of a listing and a read of
 * the same 4 requests. `undefined` where it cannot be told: no column every
 * set stores, a set whose rows were not all sent, or anything withheld.
 */
function distinctRows(summary: AutomationStudioRunResultSummary): number | undefined {
  if (summary.withheld) return undefined;
  const sets = summary.recordSets;
  if (sets.some((set) => set.truncated || set.columnsWithheld || (set.sampleRows?.length ?? 0) !== set.recordCount)) return undefined;
  const shared = sets[0]!.columns.filter((column) => sets.every((set) => set.columns.includes(column)));
  if (!shared.length) return undefined;
  const keys = new Set(sets.flatMap((set) => (set.sampleRows ?? []).map((row) => JSON.stringify(shared.map((column) => row[column] ?? null)))));
  return keys.size;
}

/** "30 records would be stored": every row of every dataset a build's Flow would write, which the card says as rows that would be stored. */
function wouldStore(stores: NonNullable<NonNullable<AutomationStudioRunResultSummary["buildTest"]>["stores"]>): string {
  const rows = stores.reduce((total, store) => total + store.answer.rows, 0);
  return `${rows} record${rows === 1 ? "" : "s"} would be stored`;
}

/**
 * A verification that fails the run.
 *
 * `repair` reaches only a `does_not_answer`. An `unsure` is a result nobody could
 * judge, so there is nothing to instruct a repair to change, and
 * `recovery/refuted-result/attempt.ts` already refuses to build a repair from one
 * for the same reason -- "a repair planned from it would be a change to a Flow on
 * evidence that nothing was wrong with it".
 */
function failed(
  verdict: AutomationStudioResultVerdict,
  basis: AutomationStudioResultVerdictBasis,
  code: string,
  reason: string,
  observation: string,
  repair?: AutomationStudioResultRepairDirective
): AutomationStudioResultVerification {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    verdict,
    basis,
    code,
    reason,
    observation,
    ...(repair ? { repair } : {}),
    failure: automationStudioResultFailureRecord({ verdict, code, observation, ...(repair ? { repair } : {}) })
  };
}
