import type { ClientGatewayCommandContext } from "../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionObservationContext } from "../../../execution-admission/contracts/index.ts";

/** Trusted backend bridge; provenance is an original private witness, never owner JSON. */
export interface ObservedGatewayBinding {
  bind(
    parent: ExecutionObservationContext,
    originalProvenance: object,
    existingContext?: ClientGatewayCommandContext
  ): Promise<ClientGatewayCommandContext>;
  /** Completion of the original child only; this never grants execution or authenticates owner JSON. */
  readCompletion?(
    originalContext: ClientGatewayCommandContext,
    originalParent: ExecutionObservationContext
  ): "settled" | "pending" | "unknown";
}
