import type { ExecutionEntry } from "../entry/index.ts";
import type { ExecutionReservation } from "./handle.ts";

export interface ReservedExecution {
  readonly reservation: ExecutionReservation;
  readonly root: ExecutionEntry;
}
