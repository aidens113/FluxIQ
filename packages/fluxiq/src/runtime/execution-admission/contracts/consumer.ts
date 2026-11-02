import type { ExecutionScope } from "./scope/index.ts";
import type { ExecutionEntryGrant } from "./entry/index.ts";
import type { ExecutionInspection } from "./inspection/index.ts";
import type { ExecutionReservation, ReservedExecution } from "./reservation/index.ts";

export interface ExecutionAdmissionConsumer {
  inspect(scope: ExecutionScope): Promise<ExecutionInspection>;
  reserve(scope: ExecutionScope, grant: ExecutionEntryGrant, signal?: AbortSignal): Promise<ReservedExecution>;
  release(reservation: ExecutionReservation): Promise<void>;
}
