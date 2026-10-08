import { ACTIVITY_ACTION_REFUSAL_WORDS } from "./refusal-words.ts";

/**
 * The loop's codes for a decision Core declined before doing it
 * (`programs/automation-studio/runtime/llm/`): a call refused as a repeat of
 * one that already ran (`repeat-guard/feedback.ts`), an edit to the draft whose
 * changes were refused (`draft-amendment-feedback.ts`), and an edit that only
 * put the draft back as it stood.
 */
const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";
const AMENDMENTS_REFUSED = "llm_evidence_loop.draft_amendments_refused";
const AMENDMENT_UNDONE = "llm_evidence_loop.draft_amendment_undone";

/** The reasons that refuse only a step asked to run again. */
const RERUN_REASONS: ReadonlySet<string> = new Set(["changes_nothing", "rerun_holds_binding"]);

const AMENDMENT: Readonly<Record<string, string>> = ACTIVITY_ACTION_REFUSAL_WORDS.amendment;
const REPEATED: Readonly<Record<string, string>> = ACTIVITY_ACTION_REFUSAL_WORDS.repeated;

/** The most reasons one card says. */
const MAX_REASONS = 2;

/**
 * What Core declined of a decision, read from its card's record
 * (`./record.ts`), or null when the record is no refusal of Core's.
 *
 * - `all`: true when nothing of it was done; false for an edit some of whose
 *   changes landed (`applied` above 0), so only the rest was not.
 * - `rerun`: the decision asked for a step to run again, and that was what
 *   was not done.
 * - `because`: why, in Core's words (`./refusal-words.ts`), at most two
 *   reasons joined; never a code. A reason with no words is left out, and a
 *   refusal with none left says the Flow is as it was.
 */
export function activityActionRefusal(record: { resultCode: string | undefined; reason?: string | undefined; applied?: number | undefined; declined?: string | undefined }): { all: boolean; rerun: boolean; because: string } | null {
  // A call Core declined and said why in words (`./record.ts`, `Declined`): nothing of it was done.
  if (record.declined) return { all: true, rerun: false, because: record.declined };
  const code = record.resultCode?.trim().toLowerCase();
  if (code === REPEAT_REFUSED) {
    return { all: true, rerun: true, because: REPEATED[record.reason?.trim().toLowerCase() ?? ""] ?? REPEATED.same_result! };
  }
  if (code === AMENDMENT_UNDONE) return { all: true, rerun: false, because: "the Flow would only be back as it was before" };
  if (code !== AMENDMENTS_REFUSED) return null;
  const reasons = (record.reason ?? "").split(",").map((reason) => reason.trim().toLowerCase()).filter(Boolean);
  const said = [...new Set(reasons.map((reason) => AMENDMENT[reason]).filter((words): words is string => words !== undefined))].slice(0, MAX_REASONS);
  const all = !(record.applied !== undefined && record.applied > 0);
  return {
    all,
    rerun: reasons.length > 0 && reasons.every((reason) => RERUN_REASONS.has(reason)),
    because: said.length ? said.join("; and ") : all ? "the Flow is as it was" : "the rest of it changed nothing"
  };
}
