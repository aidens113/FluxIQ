import type { ExecutionEntry } from "./handle.ts";
import type { ExecutionEntrySnapshot } from "./snapshot.ts";
import type { ExecutionReservation } from "../reservation/index.ts";

/** Trusted composition only. Re-read the original entry inside the claim transaction. */
export interface ExecutionEntryBridge {
  read(entry: ExecutionEntry): ExecutionEntrySnapshot;
  matchesReservation(entry: ExecutionEntry, reservation: ExecutionReservation): boolean;
}
