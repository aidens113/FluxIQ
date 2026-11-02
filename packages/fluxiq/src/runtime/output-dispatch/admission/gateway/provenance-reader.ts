import type { ClientGatewayCommandContext } from "../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionObservationContext } from "../../../execution-admission/contracts/index.ts";

/** Reads exact backend-parent membership and actual run ownership synchronously. */
export interface ObservedGatewayProvenanceReader {
  read(
    originalProvenance: object,
    parent: ExecutionObservationContext
  ): ReturnType<typeof ClientGatewayCommandContext.owner> | null;
}
