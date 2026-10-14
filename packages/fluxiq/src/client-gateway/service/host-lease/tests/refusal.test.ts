import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import { clientGatewayHostLeaseRefusal } from "../index.ts";

describe("clientGatewayHostLeaseRefusal", () => {
  it.each(Object.values(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES))("answers %s as a failed, unacted dispatch refusal whose record parses", (code) => {
    const result = clientGatewayHostLeaseRefusal("command.1", code);
    expect(result).toMatchObject({ commandId: "command.1", status: "failed" });
    expect(result.error).toEqual(expect.any(String));
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual({ category: "blocked_by_capability_or_policy", code, retryable: false, stage: "dispatch", effect: "unacted" });
  });
});
