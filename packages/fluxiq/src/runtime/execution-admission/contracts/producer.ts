import type { ExecutionEntry, ExecutionObservationContext } from "./entry/index.ts";

export interface ExecutionAdmissionProducer {
  enter(context: ExecutionObservationContext, origin: object, signal?: AbortSignal): Promise<ExecutionEntry>;
  observe(entry: ExecutionEntry, evidence: object): Promise<void>;
  finish(entry: ExecutionEntry, evidence: object): Promise<void>;
  interrupted(entry: ExecutionEntry, reason: "aborted" | "timed_out" | "callback_threw" | "observer_failed"): Promise<void>;
}
