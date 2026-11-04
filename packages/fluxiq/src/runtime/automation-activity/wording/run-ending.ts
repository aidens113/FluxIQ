// What a failed run's last row says after "Run failed": what came back, why
// that failed the run, and how the repair that followed ended, in a person's
// words (U3 of `run-musp39u8-9ac026ab`: the run returned 13 rows, its check
// judged they did not answer the request, a four-minute repair could not
// finish, and the person read a bare "Run failed").
//
// Read from the run's own record, never from a model's prose: the result
// check's recorded outcome (`resultVerification`: its verdict, and the
// observation whose first words are Core's own count, "13 records stored"),
// the repair's marker (`resultRepair`: the rows each refuted answer had and how
// the repair ended) and the re-author's code (`resultReauthor`). A run that failed
// at a step, before any result check, gets a sentence only for a fix it was not
// allowed to run, or a read whose rows its own fields refused; any other keeps
// "Run failed", and its step's own row says why.
//
// One sentence, short enough to follow "Run failed: " within a status line's
// 160 characters, and with no id in it.
//
// **Said as what follows the dash, of rows saved (t276, U-10).** Live run
// `run-muw60j7c-bb7c9a62` showed "Run failed — It returned 30 rows, but the
// check found ...": a capital after the dash the chat puts between the title
// and this sentence, and "returned" of rows the run saved. The sentence now
// opens in lower case, as the rest of the line it finishes, and says the rows
// were saved.

import { ACTIVITY_DOUBTED_ENDING_CLOSE } from "../../../ui/index.ts";
import { automationStudioActivityReasonText } from "../../activity/text/index.ts";

type Fields = Readonly<Record<string, unknown>>;

/** The sentence, in lower case after the "Run failed" it finishes, or undefined when the record has nothing to add to that. */
export function automationStudioActivityRunEnding(record: Fields | null | undefined): string | undefined {
  const verification = fields(record?.resultVerification);
  if (!verification) return failedStepEnding(record);
  if (verification.performed !== true || verification.verdict === "answers" || verification.status === "confirmed") return undefined;
  const repair = fields(record?.resultRepair);
  const rows = rowCount(repair, verification);
  const refuted = verification.verdict === "does_not_answer";
  const found = refuted ? coreFound(verification, rows) : undefined;
  if (found) return found;
  if (refuted && doubtOnly(verification, repair, fields(record?.resultReauthor))) return doubted(rows);
  const repaired = fields(record?.adaptiveRetry)?.notResumableCode === LASTING_ACT_DECLINED ? LASTING_ACT_ENDING : repairEnding(repair, fields(record?.resultReauthor));
  return `${judged(rows, refuted)}${repaired ? `, and ${repaired}` : ""}.`;
}

/**
 * Why no fix ran (`service/runtime-adaptation/repair-rerun.ts`), and what that is to a
 * person: nothing about a fix failed. Usually no fix was built, because the same check
 * runs before anything is paid for (`service/runtime-adaptation/rerun/preflight.ts`);
 * one built anyway is declined at its re-run. The sentence claims only that none ran.
 */
const LASTING_ACT_DECLINED = "repair_rerun.lasting_act_may_have_landed";
const LASTING_ACT_ENDING = "the fix wasn't run: that would repeat what this run already did";

/** The code of a no Core reached from its own computed facts, with no judge asked (`result-verification/computed-facts/computed-no.ts`). */
const COMPUTED_FACT_FAILED = "core.result.computed_fact_failed";
/** The code of a read whose every row its own record schema refused (`recovery/refuted-result/step/failure-target.ts`). */
const RECORDS_REFUSED = "record_output.records_refused";
/** The most of Core's sentence the ending says, so "Run failed: " and it fit a status line. */
const MAX_FOUND = 110;
/** The most it says when the first allowance would have cut the sentence: the row's own text holds more than the status line. */
const MAX_FOUND_LONG = 260;

/**
 * The ending of a run that failed at a step, where there is something to add: a fix
 * it was not allowed to run, or a read whose rows its fields refused, and what the
 * repair came to. Where the repair could find no read that fits, the person is told
 * that plainly: the site's rows may really not hold what the Flow stores.
 */
function failedStepEnding(record: Fields | null | undefined): string | undefined {
  if (fields(record?.adaptiveRetry)?.notResumableCode === LASTING_ACT_DECLINED) return `a step failed, and ${LASTING_ACT_ENDING}.`;
  const reauthor = fields(record?.resultReauthor);
  const last = fields(lastOf(reauthor?.attempts));
  if (fields(last?.brief)?.failureCode !== RECORDS_REFUSED) return undefined;
  return `every row it read was refused by the fields this Flow stores, and ${rowsRefusedRepair(reauthor, last)}.`;
}

/** What became of the repair of a read whose rows were refused. */
function rowsRefusedRepair(reauthor: Fields | undefined, last: Fields | undefined): string {
  if (reauthor?.held === true || reauthor?.applied === true) return "the fixed Flow didn't finish either";
  if (fields(last?.ending)?.kind === "not_doable") return "the repair found no way to read them that fits";
  return repairEnding({ attempted: true }, reauthor) ?? "the fix didn't finish";
}

/**
 * The ending for a no Core reached itself: what Core found, in its own sentence
 * (the verification's observation is the failing facts' sentences). What Core
 * found is what a person needs here, so no repair is spoken of, whatever became
 * of it. Undefined for any other verification.
 */
function coreFound(verification: Fields, rows: number | undefined): string | undefined {
  if (verification.basis !== "core_observation" || verification.code !== COMPUTED_FACT_FAILED) return undefined;
  // Never a sentence cut with "..." in it: a longer allowance first, then the plainer ending that follows.
  const read = [MAX_FOUND, MAX_FOUND_LONG].map((max) => automationStudioActivityReasonText(verification.observation, max)).find((sentence) => sentence && !sentence.endsWith("…"));
  if (!read) return undefined;
  // A person knows the product as FluxIQ: Core's own sentence ("Core counted ...", "... Core's own reading") is said in its name.
  const said = read.replace(/\.$/u, "").replace(/\bCore\b/gu, "FluxIQ");
  const finding = /^FluxIQ\b/u.test(said) ? said
    : `FluxIQ found that ${/^[A-Z][a-z]/u.test(said) ? said[0]!.toLowerCase() + said.slice(1) : said}`;
  return rows === undefined ? `${finding}.` : `it saved ${rows} ${rows === 1 ? "row" : "rows"}, but ${finding}.`;
}

/**
 * Whether the refutation rests on the judges' word alone and the repair changed
 * nothing: the verdict's basis is a model's (no count, no located defect of
 * Core's own, `repair.findings` empty) and the repair either found nothing to
 * change or kept giving the same answer. The saved Flow is then unchanged, and
 * "couldn't fix your Flow" would tell a person a working Flow was broken
 * (`run-mvskodlp-9966d618`: the 3 rows were exactly right, t785).
 */
function doubtOnly(verification: Fields, repair: Fields | undefined, reauthor: Fields | undefined): boolean {
  if (verification.basis !== "model") return false;
  const findings = fields(verification.repair)?.findings;
  if (Array.isArray(findings) && findings.length > 0) return false;
  if (reauthor?.outcome === "nothing_to_change") return true;
  if (repair?.attempted === true && repair.outcome === "stopped" && repair.stopped === "result_repair.not_converging") return true;
  // A re-author that ended with no edit applied or held, and no fixed Flow run: the repair
  // stopped before it changed anything (`run-mvskodlp-9966d618`'s `flow_bootstrap.build_not_finished`).
  return reauthor !== undefined && reauthor.applied !== true && reauthor.held !== true && repair?.outcome !== "rerun_failed" && repair?.outcome !== "unverified";
}

/** The ending for a check that only doubted the rows: what was saved, that the repair changed nothing, and that the Flow stands. */
function doubted(rows: number | undefined): string {
  const saved = rows === undefined ? "the check doubted its result" : `it saved ${rows} ${rows === 1 ? "row" : "rows"}, but the check doubted ${rows === 1 ? "it" : "them"}`;
  return `${saved}, the repair changed nothing, and ${ACTIVITY_DOUBTED_ENDING_CLOSE}.`;
}

/** What the run saved and what the check made of it. */
function judged(rows: number | undefined, refuted: boolean): string {
  if (rows === undefined) return refuted ? "the check found its result doesn't answer what you asked" : "the check couldn't confirm its result answers what you asked";
  if (rows === 0) return "it saved no rows, so it doesn't answer what you asked";
  const one = rows === 1;
  const saved = `it saved ${rows} ${one ? "row" : "rows"}`;
  if (refuted) return `${saved}, but the check found ${one ? "it doesn't" : "they don't"} answer what you asked`;
  return `${saved}, but the check couldn't confirm ${one ? "it answers" : "they answer"} what you asked`;
}

/** How a repair of the refuted answer ended; undefined when none was started. */
function repairEnding(repair: Fields | undefined, reauthor: Fields | undefined): string | undefined {
  if (!repair || repair.attempted !== true) return undefined;
  if (repair.phase === "settled") {
    if (repair.outcome === "rerun_failed") return "the fixed Flow didn't run to the end";
    if (repair.outcome === "unverified") return "the fixed Flow's answer couldn't be checked";
    if (repair.outcome === "stopped") {
      if (repair.stopped === "result_repair.not_converging") return "fixing it kept giving the same answer";
      const tries = typeof repair.attempts === "number" && Number.isSafeInteger(repair.attempts) && repair.attempts > 1 ? repair.attempts : undefined;
      return tries ? `${tries} tries at fixing it didn't help` : "fixing it didn't help";
    }
  }
  // The re-author found the Flow already does what was asked and changed nothing (W17,
  // `recovery/refuted-result/nothing-to-change.ts`): the check's verdict stands beside it.
  if (reauthor?.outcome === "nothing_to_change") return "the repair found nothing in the Flow to change";
  // Not re-run, or never settled: the re-author did not get as far as a Flow to run again.
  // Its last build's recorded ending says which limit stopped it, and whether a change was ever tested.
  const ending = fields(fields(lastOf(reauthor?.attempts))?.ending);
  const tried = fields(ending?.tried);
  const before = tried?.tested === "not_tested" ? "before it could test a change" : "before it finished";
  if (ending?.kind === "budget_exhausted") {
    // "Build rounds": a repair's attempt runs a build, and "all its rounds" read against the
    // live line's "attempt 1 of 3" (R3-U-3, run-mux6naez-6c20f26e).
    if (ending.bound === "rounds") return `the fix ran out of build rounds ${before}`;
    if (ending.bound === "cost") return `the fix spent all a repair may spend ${before}`;
    if (ending.bound === "duration") return `the fix ran out of time ${before}`;
    return `the fix reached its limit ${before}`;
  }
  const code = typeof reauthor?.code === "string" ? reauthor.code : "";
  if (/deadline|timed_out|timeout/u.test(code)) return `the fix ran out of time ${before}`;
  if (/cost|spend/u.test(code)) return `the fix spent all a repair may spend ${before}`;
  if (/budget_exhausted|evidence_budget/u.test(code)) return `the fix reached its limit ${before}`;
  return "the fix didn't finish";
}

/** The most of the check's reason a failed run's row says after its ending. */
const MAX_OBJECTION = 240;

/**
 * What the result check objected to, after the ending, for the row's text
 * only (the status line holds the ending alone): "The check said: <its
 * reason>", in whole sentences and screened of ids (`./reason-text.ts`).
 * Undefined when the run did not fail at its check or the check gave no
 * reason. "...but the check found they don't answer what you asked" named no
 * objection, while the rows were the right ones and the check doubted two
 * items (R3-U-3 of the live-C round-3 UI review, `run-mux6naez-6c20f26e`).
 */
export function automationStudioActivityRunObjection(record: Fields | null | undefined): string | undefined {
  const verification = fields(record?.resultVerification);
  if (!verification || verification.performed !== true || verification.verdict === "answers" || verification.status === "confirmed") return undefined;
  // A no FluxIQ reached from its own record has no check's reason to add: its ending already says what it found
  // ("Core's own record ... so no judge was asked" was machine prose, B 34 of the answer-first study).
  if (verification.basis === "core_observation") return undefined;
  const reason = automationStudioActivityReasonText(verification.reason, MAX_OBJECTION);
  // A reason the screen had to cut mid-sentence is left out whole, never said with "..." in it.
  return reason && !reason.endsWith("…") ? `The check said: ${reason}` : undefined;
}

/** The last entry of a recorded list, or nothing. */
function lastOf(value: unknown): unknown {
  return Array.isArray(value) ? value.at(-1) : undefined;
}

/**
 * The rows the refuted answer had: the repair's own count, else the count the
 * check's observation opens with. A result that declared no record set has no
 * rows to count: a cart Flow that only adds items read "It returned no rows"
 * (`run-muw5zv4m-52d83027`), so its count is undefined, from the repair's
 * `recordSetCount` or the observation's "across 0 record sets".
 */
function rowCount(repair: Fields | undefined, verification: Fields): number | undefined {
  const history = Array.isArray(repair?.history) ? repair.history : [];
  const last = fields(history.at(-1));
  const observation = typeof verification.observation === "string" ? verification.observation : "";
  if (last?.recordSetCount === 0 || /^\d+ records? stored\b[^;]*, across 0 record sets?\b/u.test(observation)) return undefined;
  const counted = last?.totalRecordCount;
  if (typeof counted === "number" && Number.isSafeInteger(counted) && counted >= 0) return counted;
  const observed = /^(\d+) records? stored\b/u.exec(observation)?.[1];
  return observed === undefined ? undefined : Number(observed);
}

function fields(value: unknown): Fields | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Fields : undefined;
}
