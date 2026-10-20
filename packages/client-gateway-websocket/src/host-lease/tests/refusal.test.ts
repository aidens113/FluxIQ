// The result a client answers a command refused for its host lease with.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES } from "@fluxiq/contracts/client-gateway";
import { clientGatewayHostLeaseRefusal } from "../index.ts";

describe("clientGatewayHostLeaseRefusal", () => {
  it("is a failed result that did nothing and is not retried as sent", () => {
    const message = "The command was issued under a host lease that has since been granted again, so the client did not act on it.";
    expect(clientGatewayHostLeaseRefusal("cmd-1", CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.stale, 1_000, 7)).toEqual({
      commandId: "cmd-1",
      status: "failed",
      startedAt: 1_000,
      completedAt: 1_000,
      message,
      error: message,
      failure: {
        category: "blocked_by_capability_or_policy",
        code: "host_lease.stale",
        retryable: false,
        stage: "dispatch",
        expected: "a command issued under the current host lease",
        actual: `${message} The client has seen epoch 7 for this resource.`,
        effect: "unacted"
      },
      payload: { commandId: "cmd-1", status: "refused", code: "host_lease.stale" }
    });
  });

  it("names no seen epoch when none is given, and every code's words say client, never browser", () => {
    for (const code of Object.values(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES)) {
      const refusal = clientGatewayHostLeaseRefusal("cmd-1", code, 1_000);
      expect(refusal.failure?.actual).toBe(refusal.message);
      expect(refusal.message).toMatch(/client/u);
      expect(JSON.stringify(refusal)).not.toMatch(/browser/u);
    }
  });

  it("carries a failure record Core's own parser accepts, for every code", () => {
    for (const code of Object.values(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES)) {
      const failure = clientGatewayHostLeaseRefusal("cmd-1", code, 1_000).failure;
      expect(parseAutomationStudioFailureRecord(failure), code).toEqual(failure);
    }
  });
});
