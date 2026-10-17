// Whether a first verdict is asked a second time, and what the second call
// asks.
//
// **A confirming check asks the converse question (t691).** A8
// `run-mvbr0w7e-6a01c05b`: a build test's yes was "confirmed" by a second call
// whose request was byte for byte the first's, at temperature 0, so two
// agreeing judges were one opinion counted twice -- and both said yes over an
// answer holding four rows it should not have held. The first check asks
// whether what came back is what the request asked for, and in practice reads
// the request's clauses and looks for each in the result. The converse starts
// from the result: each stored row, and whether the request's own words ask
// for it in the answer. A row the answer should not hold is what the first
// reading misses and the converse cannot.
//
// So where a verification confirms answers (`confirmAnswer`) and the model's
// first answer was yes -- taken, or held for the evidence it lacked
// (`../first-ask/model-said.ts`) -- the second call asks the converse
// (`automationStudioResultVerificationConfirmingAsk`), which the caller puts on
// that call's copy of the summary (`recheck`). That call is then an independent
// check, never an identical repeat; its verdict is weighed beside the first
// exactly as before, and its yes must pass every check a yes passes. A first
// answer that is not a yes is still asked once more with the same evidence
// (`../verify.ts`): two nos are what refute, and that rule is unchanged.
//
// **What it lists.** Each record set's stored rows by label
// (`../request-rows/summary-reads.ts`), with the reads that stored it
// (`processing.passes`), so the judge answers row by row; a set's rows the
// summary does not show are counted. The record sets only a subflow trial's
// entry collected are left out, as `../request-rows/summary-reads.ts` leaves
// them out: they answer the entry's parts, not this request. A result that
// stores no row is asked the same of its acts. Written for no site or kind of
// item.

import type { AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultModelSaid } from "../first-ask/index.ts";
import { automationStudioRequestRowsStoredOf } from "../request-rows/index.ts";

/** How a verification reads a first answer: whether a `yes` is confirmed too. */
export type AutomationStudioResultVerificationAskAgainOptions = { confirmAnswer?: boolean | undefined };

/** What the converse asks, said once above the rows (header). */
const CONVERSE = "This check confirms an earlier yes by asking the converse question, not the same one: start from what came back, not from the request. "
  + "Go through every row the result stores, record set by record set as listed below, and for each say whether the request asks for that row in its answer, quoting in double quotes the request's own words that do. "
  + "Then say whether anything the request asks the answer to hold is missing from it. "
  + "Answer diagnosis.answersRequest yes only if every stored row is one the request's own words ask for in its answer and nothing it asks for is missing. "
  + "Otherwise answer no, and in observed name each stored row the request does not ask for, with the read that stored it, or what is missing.";

/** What the converse asks of a result that stores no row (header). */
const CONVERSE_NO_ROWS = "This check confirms an earlier yes by asking the converse question, not the same one: start from what the Flow did, not from the request. "
  + "The result stores no row. Go through every step that changed something, in flowShape, and for each say whether the request asks for that act, quoting in double quotes the request's own words that do. "
  + "Then say whether any act the request asks for was not done. "
  + "Answer diagnosis.answersRequest yes only if every act is one the request's own words ask for and none it asks for is missing; otherwise answer no and name the act.";

/**
 * Whether a first verdict is asked once more: the model answered, and did not
 * answer `yes` -- or did, and the verification confirms answers. A reply that
 * carried no verdict and a call that never came back are not asked again.
 */
export function automationStudioResultVerificationAskAgain(first: AutomationStudioResultVerification, options: AutomationStudioResultVerificationAskAgainOptions = {}): boolean {
  if (first.exclusionEvidenceMissing) return true;
  return first.basis === "model" && (first.verdict !== "answers" || options.confirmAnswer === true);
}

/**
 * What the second call asks in place of the first's question (header): the
 * converse, for a first yes a confirming verification asks again; none --
 * the same evidence -- for every other second call, and where none is asked.
 */
export function automationStudioResultVerificationConfirmingAsk(first: AutomationStudioResultVerification, summary: AutomationStudioRunResultSummary, options: AutomationStudioResultVerificationAskAgainOptions = {}): string | undefined {
  if (options.confirmAnswer !== true || automationStudioResultModelSaid(first) !== "answers") return undefined;
  if (!automationStudioResultVerificationAskAgain(first, options)) return undefined;
  return converseQuestion(summary);
}

/** The converse question for a summary's result (header). */
function converseQuestion(summary: AutomationStudioRunResultSummary): string {
  const entry = new Set(summary.taskChecklist?.entry?.steps ?? []);
  const sets = summary.recordSets.filter((set) => !(entry.size > 0 && (set.processing?.passes.length ?? 0) > 0 && set.processing!.passes.every((pass) => entry.has(pass.node))));
  const lines = sets.flatMap((set) => {
    const labels = automationStudioRequestRowsStoredOf(set).map((row) => row.label);
    if (!labels.length) return [];
    const by = [...new Set((set.processing?.passes ?? []).map((pass) => pass.node))];
    const unseen = set.recordCount - labels.length;
    const head = `${set.datasetId}${by.length ? `, stored by ${by.map((node) => `read ${node}`).join(" and ")}` : ""}, ${set.recordCount} ${set.recordCount === 1 ? "row" : "rows"}${unseen > 0 ? `, ${unseen} not shown here` : ""}`;
    return [`${head}: ${labels.join(" | ")}`];
  });
  return lines.length ? [CONVERSE, ...lines].join("\n") : CONVERSE_NO_ROWS;
}
