// What blocked the last fix, in plain words, from the round's own record: the
// sentence a budget ending closes with (`./budget-exhausted.ts`; R2-U-2).
//
// Live run `run-muwansvz-a2b4a987` ran out of money repairing a read the judge
// had refuted. Its last seven tries were each turned down unrun -- the read's
// list was named by a handle that did not say which list (0034, then the same
// refusal again at 0039 and 0046), or the step asked to run again was the very
// request already refused (0036, 0041, 0043, 0048) -- and its ending said none
// of it: "What held it up" comes from the last refusal codes the model was
// shown, and those named nothing it knew. The record says it exactly, row by
// row, so the ending reads the tries from there: the round's last rows, back to
// the last step that ran and worked, each said as the kind of thing that
// stopped it. Counts and kinds only; no page value, id or code is said.
//
// Rows that are Core's own bookkeeping -- a test's steps (`dryrun.`), the
// opening look (`initial.`), a rerun's reset and the steps it does again first
// (`rerun.<step>.<...>`), Core's checks (`core.*_check`, `core.no_progress`),
// decisions that completed or could not be used -- are passed over. A step run
// again (`rerun.<step>`) that did not fail, or any call that changed the page,
// ends the walk: what came before it is not what blocked the last fix.

import type { AutomationStudioLlmEvidenceLoopTrace } from "../../llm/index.ts";

/** How one try was stopped, as the ending says it. */
type Stopped = "list_handle" | "handle" | "unseen" | "failed" | "edit_refused" | "unchanged";

/** Each kind, as the clause that finishes "... and each time ...". In the order they are said. */
const CLAUSES: Readonly<Record<Stopped, string>> = Object.freeze({
  list_handle: "the step did not say which list on the page to read",
  handle: "the step did not say which part of the page to use",
  unseen: "the step named something that was not on the page",
  failed: "the step did not work",
  edit_refused: "the change it asked for in the Flow was turned down",
  unchanged: "it was the same as a try already made, so it was not run again"
});
const ORDER = Object.keys(CLAUSES) as Stopped[];

/** A refusal the web domain gives a handle that does not say which element (`malformed_handle` and its kin). */
const HANDLE_REASONS: ReadonlySet<string> = new Set(["malformed_handle", "not_a_handle", "handle_in_wrong_parameter"]);
/** The domain's own word for a refusal it gave again in place of its cause (`repeated-refusal.ts`). */
const SAME_AGAIN = "answered_the_same_again";
/** An amendment refused because it changed nothing (`../../flow-draft/amendment/types.ts`). */
const NOTHING_CHANGED: ReadonlySet<string> = new Set(["changes_nothing", "already_so", "already_in_flow", "already_out"]);
/** A result code that says the call did not do what it was sent to (as `../../activity/observer.ts` reads one). */
const FAILING = /reject|fail|error|timeout|timed_out|refused|denied|invalid|blocked|not_found|unobserved/u;
const NOT_SEEN = /unobserved|not_found/u;
const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";
/** Core's own checks, said as rows of their own. */
const CORE_CHECK = /^core\.(?:\w+_check|no_progress)$/u;
/** A step run again with a corrected argument (`../../llm/evidence-loop/rerun-request.ts`), and the bookkeeping before it. */
const RERUN = /^rerun\.\d+$/u;
const BOOKKEEPING = /^(?:dryrun\.|initial\.|rerun\.\d+\.)/u;
/** How far back the walk looks. */
const MOST_ROWS = 40;

/**
 * "What blocked the last fix: it was tried 7 times, and each time the step did
 * not say which list on the page to read, or it was the same as a try already
 * made, so it was not run again." -- or nothing, when the round's last rows
 * hold no try that was stopped. `repaired` says the round was a repair; an
 * exploring round's is what held it up at the end.
 */
export function automationStudioFlowBootstrapLastFixBlockedSaid(trace: readonly AutomationStudioLlmEvidenceLoopTrace[], repaired: boolean): string {
  const kinds = new Set<Stopped>();
  let tries = 0;
  for (const row of trace.slice(-MOST_ROWS).reverse()) {
    const stopped = stoppedBy(row);
    if (stopped === "worked") break;
    if (stopped === undefined) continue;
    tries += 1;
    if (stopped !== "same") kinds.add(stopped);
  }
  if (tries === 0) return "";
  // Only repeats of a refusal whose first the walk did not reach: said as the repeats they are.
  if (kinds.size === 0) kinds.add("unchanged");
  const clauses = ORDER.filter((kind) => kinds.has(kind)).map((kind) => CLAUSES[kind]);
  const lead = repaired ? "What blocked the last fix" : "What held it up at the end";
  return tries === 1
    ? `${lead}: it was tried once, and ${clauses.join(", or ")}.`
    : `${lead}: it was tried ${tries} times, and each time ${clauses.join(", or ")}.`;
}

/** What stopped one row's try; `same` for a refusal given again; `worked` for a step that ran; nothing for a row that is not a try. */
function stoppedBy(row: AutomationStudioLlmEvidenceLoopTrace): Stopped | "same" | "worked" | undefined {
  if (row.decision === "amend_draft") {
    const refused = row.amendmentsRefused ?? [];
    if (refused.some((refusal) => NOTHING_CHANGED.has(refusal.reason))) return "unchanged";
    return refused.length > 0 && !(row.amended !== undefined && row.amended > 0) ? "edit_refused" : undefined;
  }
  if (row.decision !== "tool_call") return undefined;
  const id = row.callId ?? "";
  if (BOOKKEEPING.test(id) || CORE_CHECK.test(row.toolId ?? "")) return undefined;
  const code = row.resultCode ?? "";
  if (code === REPEAT_REFUSED) return "unchanged";
  if (row.resultReason === SAME_AGAIN) return "same";
  if (row.resultReason !== undefined && HANDLE_REASONS.has(row.resultReason)) return /list/iu.test(row.nodeId ?? "") ? "list_handle" : "handle";
  if (FAILING.test(code)) return NOT_SEEN.test(code) ? "unseen" : "failed";
  return row.effectApplied === true || RERUN.test(id) ? "worked" : undefined;
}
