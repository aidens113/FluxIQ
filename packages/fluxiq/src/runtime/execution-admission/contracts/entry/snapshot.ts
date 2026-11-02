import type { ExecutionEntryRow } from "./row.ts";

/** Informational bridge output; it must never be accepted instead of an entry. */
export interface ExecutionEntrySnapshot {
  readonly row: ExecutionEntryRow;
  readonly fenceGeneration: string;
  readonly sourceOwner: object;
  readonly origin: object;
  readonly lifecycle: "open" | "finishing" | "closed" | "blocked";
  readonly reservationActive: boolean;
}
