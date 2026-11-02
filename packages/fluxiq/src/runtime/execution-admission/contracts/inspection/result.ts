import type { ExecutionSafetyState } from "./state.ts";

/** Informational only; even a clear inspection grants no entry rights. */
export interface ExecutionInspection {
  readonly state: ExecutionSafetyState;
  readonly generation: string;
  readonly blockers: readonly {
    readonly entryId: string;
    readonly code: string;
  }[];
}
