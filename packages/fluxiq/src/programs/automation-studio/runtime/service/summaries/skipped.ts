// Why a step was passed over rather than run, projected from a saved attempt
// onto the run detail: a sometimes-present step that was not shown
// (`target_absent`), a step state routing passed over (`state_routed`), and a
// lasting act the run had already completed (`already_done`, t411,
// `executor/step-loop/already-done.ts`). Each keeps its own reason: an act
// already done read as `target_absent`, a step that was not there (t415).
//
// Session traces are read back from storage, so the record is parsed, not
// typed, and one outside these shapes is dropped whole.
import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

type RunDetailSkipped = NonNullable<AutomationStudioFlowRunActionAttemptRecord["skipped"]>;

/** An id: no whitespace, at most 200 characters. */
const ID = /^[^\s]{1,200}$/u;
/** The most of a row's name the run detail keeps: the chat's own cut of a row (`activity/loop/row.ts`) is shorter. */
const MAX_ROW_CHARS = 200;

/** The run detail's `skipped` for one attempt; undefined when it was not skipped or the record is malformed. */
export function automationStudioRunDetailSkipped(attempt: AutomationStudioNodeAttemptTrace): RunDetailSkipped | undefined {
  const skipped = attempt.skipped as unknown;
  if (typeof skipped !== "object" || skipped === null || Array.isArray(skipped)) return undefined;
  const fields = skipped as Record<string, unknown>;
  if (typeof fields.code !== "string" || !fields.code) return undefined;
  const code = fields.code;
  if (fields.reason === "state_routed") {
    if (typeof fields.toNodeId !== "string" || (fields.direction !== "forward" && fields.direction !== "backward")) return undefined;
    return { reason: "state_routed", code, toNodeId: fields.toNodeId, direction: fields.direction };
  }
  if (fields.reason === "already_done") {
    if (typeof fields.attemptId !== "string" || !ID.test(fields.attemptId)) return undefined;
    const row = typeof fields.row === "string" ? fields.row.trim().slice(0, MAX_ROW_CHARS) : "";
    return { reason: "already_done", code, attemptId: fields.attemptId, ...(row ? { row } : {}) };
  }
  // `target_absent`, and a reason from an older trace that named none.
  return { reason: "target_absent", code };
}
