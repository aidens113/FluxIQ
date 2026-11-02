import type { ExecutionReservation } from "../reservation/index.ts";
import type { ExecutionEntry } from "./handle.ts";

export interface ExecutionObservationContext {
  readonly reservation: ExecutionReservation;
  readonly parent: ExecutionEntry;
}
