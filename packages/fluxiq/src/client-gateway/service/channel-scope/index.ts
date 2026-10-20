// Channel scopes on the gateway's session view and command channel (traces and
// offline trials, P1): where the gateway reads the dispatching scope, the
// visibility rule, and how a command across a scope is refused.
export { clientGatewayChannelScopeAdmission } from "./admission.ts";
export { CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES, type ClientGatewayChannelScopeRefusalCode } from "./codes.ts";
export { clientGatewayChannelScopeRefusal } from "./refusal.ts";
export { ClientGatewayChannelScopeRefusedError } from "./refused-error.ts";
export type { ClientGatewayChannelScopeSource } from "./source.ts";
export { clientGatewayChannelScopeVisible } from "./visibility.ts";
