import type { ClientGatewayCommandContext } from "../../../../../client-gateway/service/command-ledger/index.ts";

/** Actual durable execution-root ownership, read only from an original private proof. */
export interface OrdinaryExecutionRunBinding {
  readonly kind: "execution_root";
  readonly owner: Pick<ReturnType<typeof ClientGatewayCommandContext.owner>, "projectId" | "runId" | "flowId">;
}
