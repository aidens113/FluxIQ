// The one step both trial gates take over an `offlineFirst` answer (trace
// plan P6, t769; contract in `./contracts.ts`). It validates the answer
// against the revision and digest the gate is testing and says what the gate
// does next: keep a failure the recording demonstrates in place of the site
// trial, or run live with a note for that trial's evidence.
//
// Anything it cannot read as a valid answer runs live as `inconclusive`: a
// malformed or mismatched answer, a kept verdict other than `no` or
// `execution_failed`, and a kept `yes` above all, so an offline yes never
// becomes the gate's answer (Decision 3). A gate that catches a throw from
// `offlineFirst` passes `undefined`, which runs live the same way. Running
// live is always safe: it is today's trial.
import { AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS as WORDS } from "./words.ts";
import type {
  AutomationStudioTrialOfflineCheck,
  AutomationStudioTrialOfflineFirstChecked,
  AutomationStudioTrialOfflineFirstLogged,
  AutomationStudioTrialOfflineFirstResult,
  AutomationStudioTrialOfflineFirstStepOutcome
} from "./contracts.ts";

/** A plain code: what a note's `why` may be, so no page, run or recording text reaches the model through it. */
const CODE = /^[a-z][a-z0-9_.-]{0,59}$/u;
const KEPT_VERDICTS: Readonly<Record<string, string>> = Object.freeze({ no: "kept_no", execution_failed: "kept_failed" });
const INVALID = "offline_answer_invalid";
const MISMATCH = "offline_answer_mismatch";
const KEPT_YES = "offline_kept_yes";

/** Not a valid answer: the reason the trial runs live. */
class Refused { constructor(readonly why: string) {} }

export function automationStudioTrialOfflineFirstStep<TResult extends AutomationStudioTrialOfflineFirstResult>(
  answer: unknown,
  expected: { revision: number; digest: string }
): AutomationStudioTrialOfflineFirstStepOutcome<TResult> {
  try {
    if (!isRecord(answer)) throw new Refused(INVALID);
    const checked = checkedOf(answer.checked);
    if (answer.kind === "kept") return kept<TResult>(answer, expected, checked);
    if (answer.kind === "live") {
      onlyKeys(answer, ["kind", "note", "checked"]);
      return live(noteOf(answer.note), checked);
    }
    throw new Refused(INVALID);
  } catch (error) {
    // A malformed result (one structuredClone cannot copy, say) is an invalid answer like any other.
    return live({ outcome: "inconclusive", why: error instanceof Refused ? error.why : INVALID, said: WORDS.inconclusive }, undefined);
  }
}

function kept<TResult extends AutomationStudioTrialOfflineFirstResult>(answer: Record<string, unknown>, expected: { revision: number; digest: string }, checked: AutomationStudioTrialOfflineFirstChecked | undefined): AutomationStudioTrialOfflineFirstStepOutcome<TResult> {
  onlyKeys(answer, ["kind", "result", "standingNo", "checked"]);
  const result = answer.result;
  if (!isRecord(result) || !Number.isSafeInteger(result.revision) || typeof result.digest !== "string" || typeof result.verdict !== "string" || !isRecord(result.feedback)) throw new Refused(INVALID);
  if (result.verdict === "yes") throw new Refused(KEPT_YES);
  const logged = KEPT_VERDICTS[result.verdict];
  if (!Object.hasOwn(KEPT_VERDICTS, result.verdict) || !logged) throw new Refused(INVALID);
  if (result.revision !== expected.revision || result.digest !== expected.digest) throw new Refused(MISMATCH);
  return {
    kind: "keep",
    result: structuredClone(result) as TResult,
    ...(answer.standingNo !== undefined ? { standingNo: answer.standingNo } : {}),
    evidence: { checkedAgainst: "recorded_run" },
    said: WORDS.kept,
    logged: { outcome: logged, ...counts(checked) }
  };
}

function live<TResult extends AutomationStudioTrialOfflineFirstResult>(note: AutomationStudioTrialOfflineCheck, checked: AutomationStudioTrialOfflineFirstChecked | undefined): AutomationStudioTrialOfflineFirstStepOutcome<TResult> {
  const logged: AutomationStudioTrialOfflineFirstLogged = note.outcome === "not_tried"
    ? { outcome: `refused:${note.why}` }
    : { outcome: note.outcome, ...(note.outcome === "gap" ? { step: note.step } : {}) };
  return { kind: "live", note, evidence: { offlineCheck: structuredClone(note) }, logged: { ...logged, ...counts(checked) } };
}

/** The note as the evidence carries it, with its sentence; refused unless exactly one of the contract's shapes. */
function noteOf(note: unknown): AutomationStudioTrialOfflineCheck {
  if (!isRecord(note)) throw new Refused(INVALID);
  switch (note.outcome) {
    case "passed":
      onlyKeys(note, ["outcome"]);
      return { outcome: "passed", said: WORDS.passed };
    case "gap": {
      onlyKeys(note, ["outcome", "step", "why"]);
      const step = note.step;
      if (typeof step !== "number" || !Number.isSafeInteger(step) || step < 1) throw new Refused(INVALID);
      const why = codeOf(note.why);
      return { outcome: "gap", step, why, said: WORDS.gap(step, why) };
    }
    case "inconclusive":
      onlyKeys(note, ["outcome", "why"]);
      return note.why === undefined ? { outcome: "inconclusive", said: WORDS.inconclusive } : { outcome: "inconclusive", why: codeOf(note.why), said: WORDS.inconclusive };
    case "not_tried":
      onlyKeys(note, ["outcome", "why"]);
      return { outcome: "not_tried", why: codeOf(note.why), said: WORDS.notTried };
    default:
      throw new Refused(INVALID);
  }
}

function checkedOf(value: unknown): AutomationStudioTrialOfflineFirstChecked | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Refused(INVALID);
  onlyKeys(value, ["matched", "recorded"]);
  const { matched, recorded } = value;
  if (!isCount(matched) || !isCount(recorded) || matched > recorded) throw new Refused(INVALID);
  return { matched, recorded };
}

function counts(checked: AutomationStudioTrialOfflineFirstChecked | undefined): Pick<AutomationStudioTrialOfflineFirstLogged, "matchedOperations" | "recordedOperations"> {
  return checked ? { matchedOperations: checked.matched, recordedOperations: checked.recorded } : {};
}

function codeOf(value: unknown): string {
  if (typeof value !== "string" || !CODE.test(value)) throw new Refused(INVALID);
  return value;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Refused(INVALID);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
