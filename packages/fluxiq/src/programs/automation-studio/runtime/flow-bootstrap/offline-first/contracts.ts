// The offline-first contract both trial gates share (trace plan P6, t769): a
// trial port's optional `offlineFirst` member, which the gate asks once per
// test call, before any site action, while the revision and digest have not
// been tried yet (D41). It answers whether the recording of this build's last
// live test of the same scope already demonstrates a failure (kept in place
// of the site trial) or whether the trial runs live, with a note of how the
// offline check went.
//
// Domain-neutral and trace-free: nothing here names a trace, a matcher or a
// recorded operation's shape. The service that owns the recording maps its
// runner's outcome into this answer (`runtime/service/offline-first/`); the
// gates read it through `./gate-step.ts` and never import the trace code. This
// directory is on the `from` side of the "trace-free model guidance" boundary
// (Core `scripts/structure-audit/config.mjs`).
import type { JsonObject } from "../../../../../core/index.ts";

/**
 * The fields of a trial result an offline-first answer is checked by: both
 * `AutomationStudioCandidateTrialResult` and `AutomationStudioSubflowTrialResult`
 * have them. The gate runs a kept result through its own result checks too.
 */
export type AutomationStudioTrialOfflineFirstResult = {
  revision: number;
  digest: string;
  verdict: string;
  feedback: JsonObject;
};

/** How much of the recording the offline run matched: operations matched, of those recorded. For the step log only. */
export type AutomationStudioTrialOfflineFirstChecked = { matched: number; recorded: number };

/**
 * How the offline check went, when the trial then runs live in the same call.
 * `why` is a plain code (lower case, `a-z0-9_.-`, at most 60 characters),
 * never text from a page, a run or a recording:
 * - `passed`: the revision passed against the recording; the live trial's verdict is kept (Decision 3);
 * - `gap`: the recording could not answer feedback step `step` (1-based), for the matcher's reason `why`;
 * - `inconclusive`: the offline run settled nothing (judge unsure or not judged, unaffordable, an invalid answer);
 * - `not_tried`: the offline run was refused before it ran (no recording of this scope, a phase that may not, ...); `why` is the refusal code.
 */
export type AutomationStudioTrialOfflineFirstNote =
  | { outcome: "passed" }
  | { outcome: "gap"; step: number; why: string }
  | { outcome: "inconclusive"; why?: string }
  | { outcome: "not_tried"; why: string };

/**
 * What `offlineFirst` answers. `kept`: a failure the recording demonstrates,
 * whose `result.verdict` is `no` or `execution_failed`; the gate takes it in
 * place of the port's answer and touches nothing on the site. Any other kept
 * verdict, a yes included, is refused and the trial runs live. `standingNo`
 * is carried unread, as a port's result carries it. `live`: the trial runs on
 * the site in this same call, and its evidence carries the note.
 */
export type AutomationStudioTrialOfflineFirstAnswer<TResult extends AutomationStudioTrialOfflineFirstResult> =
  | { kind: "kept"; result: TResult; standingNo?: unknown; checked?: AutomationStudioTrialOfflineFirstChecked }
  | { kind: "live"; note: AutomationStudioTrialOfflineFirstNote; checked?: AutomationStudioTrialOfflineFirstChecked };

/**
 * The optional trial port member: asked with the request the gate would send
 * the port (before any reset, so without `startedWith`). `TRequest` is
 * `AutomationStudioCandidateTrialRequest` on a whole candidate's port and
 * `AutomationStudioSubflowTrialRequest` on a subflow's; `TResult` the port's
 * result type. A throw is answered as an invalid answer (`./gate-step.ts`):
 * the trial runs live.
 */
export type AutomationStudioTrialOfflineFirst<TRequest, TResult extends AutomationStudioTrialOfflineFirstResult> =
  (request: TRequest) => Promise<AutomationStudioTrialOfflineFirstAnswer<TResult>>;

/** The note as the gate's evidence carries it: the note and its plain sentence (`./words.ts`). */
export type AutomationStudioTrialOfflineCheck = AutomationStudioTrialOfflineFirstNote & { said: string };

/**
 * The fields the gate adds to the trial's evidence: `checkedAgainst` on a
 * kept answer, `offlineCheck` on a live one.
 */
export type AutomationStudioTrialOfflineFirstEvidence =
  | { checkedAgainst: "recorded_run" }
  | { offlineCheck: AutomationStudioTrialOfflineCheck };

/**
 * What the gate's step log is told of the answer, in the shape
 * `automationStudioLlmStepLogOfflineTrial`'s `describe` returns (`runtime/llm/
 * step-log/offline-trial-step.ts`): `kept_no`, `kept_failed`, `passed`, `gap`,
 * `inconclusive`, or `refused:<code>` for a note not tried; the gap's step;
 * and the counts. Codes and counts only.
 */
export type AutomationStudioTrialOfflineFirstLogged = {
  outcome: string;
  step?: number;
  matchedOperations?: number;
  recordedOperations?: number;
};

/**
 * What `automationStudioTrialOfflineFirstStep` tells the gate. `keep`: weigh
 * `result` (and `standingNo`) as the port's answer, add `evidence`, and put
 * `said` before the instruction; skip the reset, the start hook and
 * `leftOnSite`. `live`: run today's live path and add `evidence`.
 */
export type AutomationStudioTrialOfflineFirstStepOutcome<TResult extends AutomationStudioTrialOfflineFirstResult> =
  | { kind: "keep"; result: TResult; standingNo?: unknown; evidence: { checkedAgainst: "recorded_run" }; said: string; logged: AutomationStudioTrialOfflineFirstLogged }
  | { kind: "live"; note: AutomationStudioTrialOfflineCheck; evidence: { offlineCheck: AutomationStudioTrialOfflineCheck }; logged: AutomationStudioTrialOfflineFirstLogged };
