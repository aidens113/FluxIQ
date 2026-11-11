// A run step Core skipped because its act was already done in this run, for
// the same row (Core's `executor/step-loop/already-done.ts`, t411): the
// friend request already confirmed is never confirmed again. No DOM.
//
// Core says it with one `step` row that carries a closed `skipped` field with
// reason `already_done` (t416), read by the one reader, `stepSkip`. The row's
// words ("Already done for Lin Zhao") are never parsed. Its card reads
// "Already done — not pressed again" (or not typed, not opened, not repeated), never "Didn't work", and is never taken for a step done
// again or a retry that worked (`done-again.ts`, `retried.ts`).

import { stepRecovery, stepSkip, type ClientGatewayActivity } from "fluxiq/ui";

/** Whether `event` is Core's row for a run step skipped as already done. */
export function isAlreadyDoneStep(event: ClientGatewayActivity): boolean {
  const skip = stepSkip(event);
  if (skip) return skip.reason === "already_done";
  const detail = event.detail;
  // A skip field this panel cannot read is never guessed at from the shape.
  if (detail?.skipped !== undefined) return false;
  // Fallback for an older Core (t411 to t415) that sends no `skipped` field:
  // its already-done row is the only run step (`step` set) that is already
  // `succeeded` when it arrives and carries no record of the node it would run
  // (`detail.text`, "Node: web.click"), since nothing ran. Every other run step
  // is announced `started` with that record (`messages.ts`), and a recovery's
  // row names no step (`recovery-message.ts`). Remove once no supported Core
  // predates t416.
  return event.step !== undefined && detail?.kind === "step" && detail.status === "succeeded" && detail.text === undefined && stepRecovery(event) === undefined;
}
