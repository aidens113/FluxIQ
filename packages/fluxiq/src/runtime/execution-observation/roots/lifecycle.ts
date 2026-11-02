import type { ExecutionEntry, ExecutionObservationContext, ExecutionReservation, ReservedExecution } from "../../execution-admission/index.ts";
import type { ExecutionObservationSource } from "../source.ts";

/** Trusted adapters retain their configured source, policy, evidence and durable owner. */
export interface ExecutionCallbackRootLifecycle {
  readonly callbacks: ExecutionObservationSource;
  reserve(signal?: AbortSignal): Promise<ReservedExecution>;
  finish(root: ExecutionEntry): Promise<void>;
  unverified(root: ExecutionEntry): Promise<void>;
  interrupted(root: ExecutionEntry, reason: "observer_failed"): Promise<void>;
  release(reservation: ExecutionReservation): Promise<void>;
  prepared?(originalContext: ExecutionObservationContext, originalRoot: ExecutionEntry): void | Promise<void>;
}
