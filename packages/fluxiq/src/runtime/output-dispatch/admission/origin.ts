import type { ClientGatewayCommandContext } from "../../../client-gateway/service/command-ledger/index.ts";
import type { OrdinaryExecutionRunBindingReader } from "./gateway/index.ts";

/** Actual framework invocation coordinates; rights still require original private membership. */
export interface OutputInvocationOrigin {
  readonly invocationId: string;
  readonly attemptId: string;
  readonly effectOrdinal: number;
  readonly commandContext?: ClientGatewayCommandContext;
  readonly run?: { readonly proof: object; readonly reader: OrdinaryExecutionRunBindingReader };
}
