import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES, clientGatewayChannelScopeAdmission, clientGatewayChannelScopeRefusal, clientGatewayChannelScopeVisible } from "../index.ts";

describe("channel scope visibility and admission", () => {
  it("shows a live session only outside any scope, and a scoped session only inside its own scope", () => {
    expect(clientGatewayChannelScopeVisible(undefined, undefined)).toBe(true);
    expect(clientGatewayChannelScopeVisible(undefined, "scope.a")).toBe(false);
    expect(clientGatewayChannelScopeVisible("scope.a", undefined)).toBe(false);
    expect(clientGatewayChannelScopeVisible("scope.a", "scope.a")).toBe(true);
    expect(clientGatewayChannelScopeVisible("scope.a", "scope.b")).toBe(false);
  });

  it("admits a visible target and classifies every crossing", () => {
    expect(clientGatewayChannelScopeAdmission(undefined, undefined)).toBeUndefined();
    expect(clientGatewayChannelScopeAdmission("scope.a", "scope.a")).toBeUndefined();
    expect(clientGatewayChannelScopeAdmission(undefined, "scope.a")).toBe(CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES.outsideScope);
    expect(clientGatewayChannelScopeAdmission("scope.b", "scope.a")).toBe(CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES.outsideScope);
    expect(clientGatewayChannelScopeAdmission("scope.a", undefined)).toBe(CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES.scopedSession);
  });

  it("answers a refused command as a failure that did nothing and must not be retried unchanged", () => {
    expect(clientGatewayChannelScopeRefusal("command.1", "channel_scope.outside_scope")).toEqual({
      commandId: "command.1",
      status: "failed",
      error: expect.any(String),
      failure: { category: "blocked_by_capability_or_policy", code: "channel_scope.outside_scope", retryable: false, stage: "dispatch", effect: "unacted" }
    });
  });
});
