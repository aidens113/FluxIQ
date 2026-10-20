// The refusal code each judgement maps to.

import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES } from "@fluxiq/contracts/client-gateway";
import { clientGatewayHostLeaseRefusalCode } from "../index.ts";

describe("clientGatewayHostLeaseRefusalCode", () => {
  it("lets an adopted or current lease run", () => {
    expect(clientGatewayHostLeaseRefusalCode("adopt")).toBeUndefined();
    expect(clientGatewayHostLeaseRefusalCode("current")).toBeUndefined();
  });

  it("refuses a stale lease and a holder mismatch with Core's codes", () => {
    expect(clientGatewayHostLeaseRefusalCode("stale")).toBe(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.stale);
    expect(clientGatewayHostLeaseRefusalCode("holder_mismatch")).toBe(CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.holderMismatch);
    expect(clientGatewayHostLeaseRefusalCode("stale")).toBe("host_lease.stale");
  });
});
