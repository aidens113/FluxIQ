import { isAutomationStudioAdaptiveFailureClass, type AutomationStudioAdaptiveFailureClass } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
export type AutomationStudioLlmRecentActionContext = Pick<AutomationStudioFlowRunActionAttemptRecord,
  "attemptId" | "nodeId" | "definitionId" | "order" | "status"
> & {
  route?: string;
  durationMs?: number;
  comparisonStatus?: string;
  /** Core's category from the attempt's failure record, when the record parses. Its code and texts are not sent. */
  failureCategory?: AutomationStudioAdaptiveFailureClass;
  /**
   * How many records the step stored, when it stored any.
   *
   * A count, and nothing about what was in them: an integer carries nothing off
   * the page, so it needs no screening, and nothing travels beside it.
   *
   * **Why the judge needs it.** The wrong answer this loop keeps producing has
   * one shape -- a step that was supposed to narrow a result stored the same rows
   * as the step before it. Live runs stored 43 records where 13 were expected,
   * and 55 where fewer were. Shown two consecutive steps holding an identical
   * count, a judge can name the step that failed to narrow; without it the count
   * has to be inferred from a result summary's totals, which cannot say which
   * step produced them. The repair has read it from the same place since
   * `runtime/recovery/repair-context/step-parameters.ts` was written; this is the
   * judge being given the same fact.
   */
  recordCount?: number;
  /**
   * `false` when the run passed the step over instead of running it (`skipped`):
   * the step did nothing on the page, whatever `status` says. Absent on a step
   * that ran, and on one whose recorded state held after it failed, where
   * whether it acted is not known.
   */
  acted?: false;
  /** Why the run passed the step over, as closed words and node or attempt ids (t486). */
  skipped?: AutomationStudioLlmRecentActionSkip;
  /**
   * The state evidence on which the step counts as done without having been
   * seen to do it (t486). Never page text.
   *
   * - `page_showed_step_effect`: the step could not run, and the host found
   *   the step's own recorded effect already on the page (state routing
   *   `effect_holds`), so the run went on as if it had run. It did not act.
   * - `recorded_state_held`: the step failed, and the state it was recorded to
   *   produce already held (`stateHeld`), so the run went on down `success`.
   */
  satisfiedByState?: AutomationStudioLlmRecentActionSatisfiedByState;
};

/**
 * Why a step was passed over, as a recent action carries it:
 *
 * - `state_routed`: the step could not run and the run went on at `toNodeId`,
 *   `forward` or `backward`, on what the page showed;
 * - `target_absent`: a sometimes-present step that was not on the page,
 *   `notDone` when it does a lasting act that was therefore not done;
 * - `already_done`: a lasting act this run completed earlier, at
 *   `doneByAttemptId`, and did not do again.
 *
 * The run's own codes and a row's label stay on the run detail.
 */
export type AutomationStudioLlmRecentActionSkip =
  | { reason: "state_routed"; toNodeId: string; direction: "forward" | "backward" }
  | { reason: "target_absent"; notDone?: true }
  | { reason: "already_done"; doneByAttemptId: string };

export type AutomationStudioLlmRecentActionSatisfiedByState = "page_showed_step_effect" | "recorded_state_held";

const SATISFIED_BY_STATE: ReadonlySet<string> = new Set<AutomationStudioLlmRecentActionSatisfiedByState>(["page_showed_step_effect", "recorded_state_held"]);

/**
 * Every field a recent action may carry. The `satisfies` clause is the point:
 * a field added to the type above and left out here, or listed here and not in
 * the type, fails the type check. The provider used to keep its own copy of
 * this list, and when `failureCategory` was added to the projection that copy
 * was not updated, so every recovery from a failure with a structured record
 * was refused before it was sent.
 */
const RECENT_ACTION_FIELDS = {
  attemptId: true,
  nodeId: true,
  definitionId: true,
  order: true,
  status: true,
  route: true,
  durationMs: true,
  comparisonStatus: true,
  failureCategory: true,
  recordCount: true,
  acted: true,
  skipped: true,
  satisfiedByState: true
} as const satisfies Record<keyof AutomationStudioLlmRecentActionContext, true>;
const RECENT_ACTION_FIELD_NAMES: ReadonlySet<string> = new Set(Object.keys(RECENT_ACTION_FIELDS));

/**
 * Whether a value is a recent action exactly as `packAutomationStudioLlmContext`
 * projects one: only the fields above, each bounded. A provider checks what it
 * is about to send with this, rather than with a list of its own.
 */
export function isAutomationStudioLlmRecentActionContext(value: unknown): value is AutomationStudioLlmRecentActionContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  if (Object.keys(action).some((key) => !RECENT_ACTION_FIELD_NAMES.has(key))) return false;
  if (typeof action.attemptId !== "string" || typeof action.nodeId !== "string" || typeof action.definitionId !== "string"
    || !Number.isSafeInteger(action.order) || typeof action.status !== "string") return false;
  if ([action.attemptId, action.nodeId, action.definitionId, action.status, action.route, action.comparisonStatus]
    .some((text) => text !== undefined && (typeof text !== "string" || text.length < 1 || text.length > 200))) return false;
  if (action.failureCategory !== undefined && !isAutomationStudioAdaptiveFailureClass(action.failureCategory)) return false;
  // A count is an integer or it is not carried. A float, a negative or a string
  // would be a number the projection did not produce.
  if (action.recordCount !== undefined && (!Number.isSafeInteger(action.recordCount) || (action.recordCount as number) < 0)) return false;
  if (action.acted !== undefined && action.acted !== false) return false;
  if (action.skipped !== undefined && !isRecentActionSkip(action.skipped)) return false;
  if (action.satisfiedByState !== undefined && (typeof action.satisfiedByState !== "string" || !SATISFIED_BY_STATE.has(action.satisfiedByState))) return false;
  return action.durationMs === undefined
    || (Number.isSafeInteger(action.durationMs) && (action.durationMs as number) >= 0 && (action.durationMs as number) <= 86_400_000);
}

/** Whether a value is a skip exactly as `recentActionSkip` projects one: its reason's fields only, each an id or a closed word. */
export function isRecentActionSkip(value: unknown): value is AutomationStudioLlmRecentActionSkip {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const skip = value as Record<string, unknown>;
  const keys = Object.keys(skip);
  const only = (allowed: readonly string[]): boolean => keys.every((key) => allowed.includes(key));
  const id = (text: unknown): boolean => typeof text === "string" && text.length >= 1 && text.length <= 200;
  if (skip.reason === "state_routed") return only(["reason", "toNodeId", "direction"]) && id(skip.toNodeId) && (skip.direction === "forward" || skip.direction === "backward");
  if (skip.reason === "target_absent") return only(["reason", "notDone"]) && (skip.notDone === undefined || skip.notDone === true);
  if (skip.reason === "already_done") return only(["reason", "doneByAttemptId"]) && id(skip.doneByAttemptId);
  return false;
}

