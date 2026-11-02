import type { ClientGatewayRuntimeTransport } from "../../../../runtime/index.ts";
import type { OutputGatewayTarget } from "../../../../runtime/output-dispatch/index.ts";

export function automationStudioExecutionGatewayTargets(transport: ClientGatewayRuntimeTransport): readonly OutputGatewayTarget[] {
  return Object.freeze([
    Object.freeze({ receiver: transport, callback: transport.dispatch }),
    Object.freeze({ receiver: transport, callback: transport.dispatchWithCommandContext })
  ]);
}
