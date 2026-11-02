import type { ExecutionObservationContext } from "../../../../execution-admission/contracts/index.ts";
import type { OrdinaryExecutionRunBinding } from "./binding.ts";

/** The owner rechecks original membership, active root and this exact parent/root relation. */
export interface OrdinaryExecutionRunBindingReader {
  readOrdinaryRunBinding(
    originalProof: object,
    parent: ExecutionObservationContext
  ): OrdinaryExecutionRunBinding | null;
}
