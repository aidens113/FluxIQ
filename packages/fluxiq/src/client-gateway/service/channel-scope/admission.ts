import { CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES, type ClientGatewayChannelScopeRefusalCode } from "./codes.ts";
import { clientGatewayChannelScopeVisible } from "./visibility.ts";

/**
 * Whether a command may go to a session from the dispatching context: nothing
 * when the session is visible there (`./visibility.ts`), else why it may not.
 */
export function clientGatewayChannelScopeAdmission(sessionScope: string | undefined, currentScope: string | undefined): ClientGatewayChannelScopeRefusalCode | undefined {
  if (clientGatewayChannelScopeVisible(sessionScope, currentScope)) return undefined;
  return currentScope === undefined ? CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES.scopedSession : CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES.outsideScope;
}
