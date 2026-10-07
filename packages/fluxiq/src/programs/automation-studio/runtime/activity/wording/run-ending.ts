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
// the repair ended) and the re-author's code (`resultReauthor`). A run that did
// not fail at its result check gets no sentence here, and its row still says
// "Run failed".
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

import { automationStudioActivityReasonText } from "./reason-text.ts";

type Fields = Readonly<Record<string, unknown>>;

/** The sentence, in lower case after the "Run failed" it finishes, or undefined when the record says the run did not fail at its result check. */
export function automationStudioActivityRunEnding(record: Fields | null | undefined): string | undefined {
  const verification = fields(record?.resultVerification);
  if (!verification || verification.performed !== true || verification.verdict === "answers" || verification.status === "confirmed") return undefined;
  const repair = fields(record?.resultRepair);
  const rows = rowCount(repair, verification);
  const refuted = verification.verdict === "does_not_answer";
  const repaired = repairEnding(repair, fields(record?.resultReauthor));
  return `${judged(rows, refuted)}${repaired ? `, and ${repaired}` : ""}.`;
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
  const reason = automationStudioActivityReasonText(verification.reason, MAX_OBJECTION);
  return reason ? `The check said: ${reason}` : undefined;
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
