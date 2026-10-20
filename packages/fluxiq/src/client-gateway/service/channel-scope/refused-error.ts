import type { ClientGatewayChannelScopeRefusalCode } from "./codes.ts";

/**
 * Thrown, before anything is sent or claimed, by a gateway command that has no
 * result to answer with (`captureSnapshot`) or must not be claimed (a durable
 * action), when its target session is across a channel scope. `code` is the
 * classified refusal; a durable command's message keeps its `durable_command.`
 * prefix, as its host-lease refusals do.
 */
export class ClientGatewayChannelScopeRefusedError extends Error {
  readonly code: ClientGatewayChannelScopeRefusalCode;

  constructor(code: ClientGatewayChannelScopeRefusalCode, message: string = code) {
    super(message);
    this.name = "ClientGatewayChannelScopeRefusedError";
    this.code = code;
  }
}
