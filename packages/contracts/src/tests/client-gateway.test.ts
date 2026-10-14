// The host lease on client gateway action commands (automation-project-agents-plan,
// `Host resources and concurrency`): optional on the wire, and every refusal
// code a valid failure-record code for the refusal both sides report.
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES, type ClientGatewayActionCommand, type ClientGatewayHostLease } from "../client-gateway.ts";
import { parseAutomationStudioFailureRecord } from "../failure/index.ts";

describe("client gateway host lease contract", () => {
  it("keeps a command without a lease valid and carries one when stamped", () => {
    const lease: ClientGatewayHostLease = { resourceKey: "resource-1", epoch: 1, holder: { role: "builder", briefId: "brief.a" } };
    const plain: ClientGatewayActionCommand = { actionType: "synthetic.act" };
    const leased: ClientGatewayActionCommand = { ...plain, lease };
    expect(Object.hasOwn(plain, "lease")).toBe(false);
    expect(JSON.parse(JSON.stringify(leased))).toEqual({ actionType: "synthetic.act", lease });
  });

  it("names three frozen refusal codes", () => {
    expect(Object.isFrozen(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES)).toBe(true);
    expect(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES).toEqual({ stale: "host_lease.stale", holderMismatch: "host_lease.holder_mismatch", missing: "host_lease.missing" });
  });

  it.each(Object.values(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES))("%s parses as a blocked, unretryable, unacted dispatch failure", (code) => {
    const record = { category: "blocked_by_capability_or_policy", code, retryable: false, stage: "dispatch", effect: "unacted" };
    expect(parseAutomationStudioFailureRecord(record)).toEqual(record);
  });
});
