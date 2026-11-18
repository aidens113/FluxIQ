import type { DeletionPendingReason } from "./types.ts";

/**
 * A deletion step that must wait and be tried again: a personal workspace
 * still has work in flight (a run keeps going to its result or its budget),
 * or the payment provider did not answer. A port throws it; the deletion is
 * then left scheduled, due at once, and the sweep finishes it. It is never a
 * failed deletion. `message` names the step and the reason only.
 */
export class DeletionPending extends Error {
  readonly reason: DeletionPendingReason;

  constructor(reason: DeletionPendingReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DeletionPending";
    this.reason = reason;
  }
}
