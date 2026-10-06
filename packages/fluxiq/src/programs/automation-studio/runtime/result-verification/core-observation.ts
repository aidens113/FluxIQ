// The verdicts Core reaches on its own, from arithmetic over the result.
//
// One of the four failures measured on 2026-09-17 needs no model to catch, and
// must therefore be caught whether or not one is configured, whether or not the
// provider answers, and whether or not the run was allowed to spend anything: a
// run whose every row was refused by record validation. The Flow did find rows,
// and the record shape it declared itself threw every one of them away, so the
// result is wrong under any reading of any request.
//
// **A plain empty result is not one of these, and used to be.** A run that
// stored no rows and had none refused was refuted here outright, on the
// reasoning that "zero rows cannot answer a request for rows, and there is no
// reading of a request under which it could". The corpus refutes that
// reasoning: "if nothing matches, an empty table is the right answer" is a real
// instruction, and a Flow that searched and found nothing has answered it,
// while an extraction that found nothing because it never looked has not. Only
// a reading of the request tells the two apart, so an empty result goes to the
// model like any other result (`verify.ts`) instead of being settled by
// arithmetic that cannot see what was asked.
//
// The counts are ones Core already holds on the run's dataset summaries.
// Nothing here reads a row, a column, or the request.
//
// A third needs no model either, and was measured live on 2026-09-18: rows
// stored with a field the Flow's own record schema declares required, and no
// value in it. Validation refuses a row whose required field is absent, but a
// string with nothing in it is a value to validation, so the row is stored and
// the run reported `passed`. `result-summary.ts` counts those rows against the
// schema the Flow itself declared; this reads the count. It never consults a
// list of fields anyone *expected* -- a person running their own automation has
// no answer key, so Core may only hold a Flow to what the Flow says.
//
// A deterministic finding wins outright: it is not a hint to a model call, it
// is the answer, and spending a call to be told so would be spending a call on
// a settled question. What belongs here is only what is settled without reading
// the request.

import { AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS, type AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type {
  AutomationStudioResultRepairDirective,
  AutomationStudioResultVerdict,
  AutomationStudioResultVerification,
  AutomationStudioRunResultSummary
} from "./contracts.ts";
import { automationStudioResultRepairDirective } from "./repair-directive.ts";

/** Core's codes for a verdict it reached itself. */
export const AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES = Object.freeze({
  everyRecordRefused: "core.result.every_record_refused",
  requiredValuesMissing: "core.result.required_values_missing"
} as const);

/**
 * The verdict Core's own counts reach, or `undefined` when they reach none and
 * the question is genuinely one only a reading of the request can settle.
 *
 * `undefined` is not "it answers". It means Core has nothing to say, and the
 * caller must go on to ask.
 */
export function automationStudioResultCoreObservation(summary: AutomationStudioRunResultSummary): AutomationStudioResultVerification | undefined {
  if (summary.recordSetCount === 0) return undefined;
  if (summary.totalRecordCount > 0) return summary.totalRowsMissingRequired > 0 ? requiredValuesMissing(summary) : undefined;
  if (summary.totalRefusedCount > 0) {
    return refused({
      summary,
      code: AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES.everyRecordRefused,
      reason: "Every row the run found was refused by record validation, so the run stored nothing and its result cannot answer the request.",
      observation: `${summary.totalRefusedCount} ${rows(summary.totalRefusedCount)} refused, 0 stored, across ${summary.recordSetCount} record ${sets(summary.recordSetCount)}.`
    });
  }
  // Stored nothing and refused nothing: an empty result, and whether that
  // answers the request is not something these counts can tell.
  return undefined;
}

/** What `expected` says when there is no directive to say anything more. */
const EXPECTED_BASELINE = "A result that answers the request the Flow was built for.";

/**
 * The failure a run reports when its result does not answer the request.
 *
 * `output_not_observed` is Core's existing name for "the action reported
 * success and its intended effect was never observed", which is this exact
 * situation one level up: the run reported success and what it was for never
 * arrived. No new failure category is introduced, so every consumer that
 * already reads the category list keeps working.
 *
 * **`expected` and `actual` are how the directive reaches the repair, and they
 * are the only way it can.** The ladder is entered with this record
 * (`recovery/refuted-result/attempt.ts`), and of everything the record carries
 * the recovery context sends the model exactly two fields: `expected` and
 * `actual`. Its own comment says why the third is not sent -- "`message` is
 * deliberately not carried: the record's own `expected` and `actual` are
 * contractually short, and the prose is not". So a refutation that wants to
 * instruct a repair has to instruct it here. `expected` therefore says what was
 * wanted *and what would produce it*, which is the one reading of "expected" a
 * repair can act on, and `actual` says what was seen. Both are bounded by the
 * record's own limit before the record is built, so a long directive is cut
 * rather than dropping the record whole.
 */
export function automationStudioResultFailureRecord(input: {
  verdict: AutomationStudioResultVerdict;
  code: string;
  observation: string;
  /** What to fix, when the verdict is a refutation. A verdict nobody reached carries none. */
  repair?: AutomationStudioResultRepairDirective | undefined;
}): AutomationStudioFailureRecord {
  return {
    // `does_not_answer` is a result that was judged wrong; `unsure` is one
    // nobody could judge, which is Core's existing "the producer could not
    // determine a cause". Both fail the run; only one of them claims to know
    // why, and a run record that conflated the two would be making a claim
    // nothing supports.
    category: input.verdict === "does_not_answer" ? "output_not_observed" : "ambiguous_or_unknown",
    code: input.code,
    retryable: false,
    stage: "verification",
    expected: boundedObservation(expectedText(input.repair)),
    actual: boundedObservation(actualText(input.observation, input.repair))
  };
}

/**
 * What was wanted, and what would produce it.
 *
 * Core's check of the rows the check names (`checked`, `request-rows/`) goes
 * between Core's fix and the check's advice: it says which of the advice rests
 * on rows the result contradicts, and the ladder's repair reads this text
 * (`../recovery/context.ts`). Live run `run-muw60j7c-bb7c9a62`: the check said
 * the Plus condition left out B0J5MCMBAY, which is in the result. Placed before
 * the advice, it is the advice the record's bound cuts first (t274-c25b).
 */
function expectedText(repair: AutomationStudioResultRepairDirective | undefined): string {
  if (!repair) return EXPECTED_BASELINE;
  const asked = repair.judgement?.expected;
  const wanted = asked ? `A result that answers the request: ${asked}` : EXPECTED_BASELINE;
  const checked = repair.checked?.length ? [`Core checked the rows the check names: ${repair.checked.join(" ")}`] : [];
  const advice = repair.judgement?.advice ? [`The check's own advice: ${repair.judgement.advice}`] : [];
  const lines = [...repair.fix, ...checked, ...advice];
  return lines.length ? `${wanted} To fix: ${lines.join(" ")}` : wanted;
}

/** What was seen: Core's counts, and what the check says it compared them against. */
function actualText(observation: string, repair: AutomationStudioResultRepairDirective | undefined): string {
  const observed = repair?.judgement?.observed;
  return observed ? `${observation} The check observed: ${observed}` : observation;
}

/** The failure record's own bound on a description, applied before the record is built rather than dropping it whole. */
function boundedObservation(observation: string): string {
  const limit = AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.textMaxLength;
  return observation.length <= limit ? observation : `${observation.slice(0, limit - 1)}…`;
}

/**
 * Rows that lack a value the Flow's own schema requires. Any one such row
 * settles it, as it does for the extraction that produced it: a row missing a
 * required field is an invalid row by the schema's own definition, so a result
 * built from it cannot be the result the Flow was declared to produce.
 */
function requiredValuesMissing(summary: AutomationStudioRunResultSummary): AutomationStudioResultVerification {
  const checked = summary.recordSets.reduce((total, set) => total + set.rowsChecked, 0);
  const fields = [...new Set(summary.recordSets.flatMap((set) => set.missingRequiredColumns))];
  const missing = summary.totalRowsMissingRequired;
  return refused({
    summary,
    code: AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES.requiredValuesMissing,
    reason: "Rows the run stored carry no value for fields the Flow's own record schema declares required, so its result cannot answer the request.",
    observation: `${missing} of ${checked} ${checked === 1 ? "row" : "rows"} checked, of ${summary.totalRecordCount} stored, ${missing === 1 ? "has" : "have"} no value for a required field${fields.length ? ` (${fields.join(", ")})` : ""}.`
  });
}

/**
 * A refutation Core reached itself, with what to do about it.
 *
 * These two refutations are settled before a provider is resolved, so no model
 * ever sees them -- and until now they were the ones that said least, because
 * they were the ones nobody was asked about. The directive is built from the same
 * summary the verdict was reached from, so a refutation that costs nothing now
 * also instructs the repair for nothing.
 */
function refused(input: { summary: AutomationStudioRunResultSummary; code: string; reason: string; observation: string }): AutomationStudioResultVerification {
  const repair = automationStudioResultRepairDirective({ summary: input.summary });
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    verdict: "does_not_answer",
    basis: "core_observation",
    code: input.code,
    reason: input.reason,
    observation: input.observation,
    repair,
    failure: automationStudioResultFailureRecord({ verdict: "does_not_answer", code: input.code, observation: input.observation, repair })
  };
}

function rows(count: number): string {
  return count === 1 ? "row was" : "rows were";
}

function sets(count: number): string {
  return count === 1 ? "set" : "sets";
}
