/**
 * A call Core refused before running any of it, in a person's words (t774).
 *
 * Core's gates answer a call they will not make -- a put-back it could not
 * show would put the site back, a destination the build has not named, a test
 * the site must first be reset for -- with an `llm_evidence_tool_execution`
 * that ran nothing (`effectApplied: false`, `targetsUnchanged: true`) and an
 * `evidence` that is `ok: false` under a `candidate.` or `subflow.` code. The
 * observer ended such a row "done" whenever its code held none of its failing
 * words (`candidate.undo_unproved`: "Put back · Change — Done", round 6), so
 * the person read that FluxIQ put the address back when nothing was pressed.
 * It is read by the answer's shape, so a gate added tomorrow is told as not
 * done without a word list to extend; the code only picks the words.
 *
 * A save or a test of the steps (`./result.ts`) has its own words and is not
 * read here.
 */

/** Why the call was not made, by the gate's code. */
const WHY: Readonly<Record<string, string>> = Object.freeze({
  "undo_unproved": "FluxIQ could not show that this would put the site back, so it was not done",
  "undo_wrong_target": "this was not the place to put the site back from, so it was not done",
  "undo_unknown_act": "there was nothing of the build's to put back by this, so it was not done",
  "undo_act_kept": "that change is being kept, so it was not put back",
  "undo_already_back": "it was already back the way the build found it",
  "undo_already_done": "it was already put back",
  "undo_refused": "putting that back was not allowed, so it was not done",
  "create_baseline_required": "the page the site is checked against was not named first, so it was not done",
  "create_baseline_unavailable": "the page the site is checked against could not be read, so it was not done",
  "trial_starts_in_end_state": "one change this build made already leaves the site as the test would end, so that one change has to be put back first",
  "toggle_not_idempotent": "a step that switches something on and off would end differently each time it ran, so it was not accepted",
  "trial_reset_required": "the site had changes left from earlier in the build",
  "trial_reset_unproved": "the site could not be shown to be back where the build began",
  "reset_witness_required": "the list that shows the site is back was not read first, so it was not done",
  "reset_destination_unissued": "the list that shows the site is back was not read first, so it was not done",
  "reset_target_unidentified": "FluxIQ could not tell which item to put back, so it was not done"
});
const FALLBACK = "FluxIQ would not do it, so nothing was done on the site";

const CODE = /^(?:candidate|subflow)\.([a-z_]+)$/u;

/** A tool that saves or tests steps, whose own words say how it ended (`./result.ts`). */
const OWN_WORDS = /^core\.(?:submit|test)_[a-z_]+$/u;

/** Why a call ended unrun, or undefined when it ran or is not a refusal of Core's gates. */
export function automationStudioActivityRunRefused(toolId: string, result: unknown): { status: "failed"; part: "Declined"; words: string; outcome: string } | undefined {
  if (OWN_WORDS.test(toolId)) return undefined;
  const answer = result && typeof result === "object" && !Array.isArray(result) ? result as { kind?: unknown; effectApplied?: unknown; targetsUnchanged?: unknown; resultCode?: unknown; evidence?: unknown } : undefined;
  if (answer?.kind !== "llm_evidence_tool_execution" || answer.effectApplied !== false || answer.targetsUnchanged !== true) return undefined;
  const evidence = answer.evidence && typeof answer.evidence === "object" && !Array.isArray(answer.evidence) ? answer.evidence as { ok?: unknown; code?: unknown } : undefined;
  if (evidence?.ok !== false) return undefined;
  const code = typeof evidence.code === "string" ? evidence.code : typeof answer.resultCode === "string" ? answer.resultCode : "";
  const name = CODE.exec(code)?.[1];
  if (name === undefined) return undefined;
  return { status: "failed", part: "Declined", words: WHY[name] ?? FALLBACK, outcome: "not done" };
}
