import type { ClientGatewayActionResult } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayChannelScopeRefusalCode } from "./codes.ts";

const REASONS: Readonly<Record<ClientGatewayChannelScopeRefusalCode, string>> = Object.freeze({
  "channel_scope.outside_scope": "This command was issued inside a channel scope to a session that scope does not hold, so it was not sent.",
  "channel_scope.scoped_session": "This command was issued outside any channel scope to a session that belongs to one, so it was not sent."
});

/**
 * The result of an action command refused across a channel scope before it was
 * sent: the same failure shape as a host-lease refusal (`failed`, category
 * `blocked_by_capability_or_policy`, not retryable, stage `dispatch`, effect
 * `unacted`), so whoever reads it treats it as a refusal that did nothing.
 */
export function clientGatewayChannelScopeRefusal(commandId: string, code: ClientGatewayChannelScopeRefusalCode): ClientGatewayActionResult {
  return {
    commandId,
    status: "failed",
    error: REASONS[code],
    failure: { category: "blocked_by_capability_or_policy", code, retryable: false, stage: "dispatch", effect: "unacted" }
  };
}
