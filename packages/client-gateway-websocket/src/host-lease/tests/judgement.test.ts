// How a readable lease stands against the highest the client has seen for its resource.

import { describe, expect, it } from "vitest";
import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { clientGatewayHostLeaseJudgement } from "../index.ts";

const lease = (epoch: number, briefId = "brief-1"): ClientGatewayHostLease => ({ resourceKey: "demo.resource:client-a", epoch, holder: { role: "builder", briefId } });

describe("clientGatewayHostLeaseJudgement", () => {
  it("adopts a first lease and a higher epoch", () => {
    expect(clientGatewayHostLeaseJudgement(lease(4), undefined)).toBe("adopt");
    expect(clientGatewayHostLeaseJudgement(lease(5, "brief-2"), lease(4))).toBe("adopt");
  });

  it("holds the same epoch and holder current", () => {
    expect(clientGatewayHostLeaseJudgement(lease(4), lease(4))).toBe("current");
  });

  it("judges a lower epoch stale", () => {
    expect(clientGatewayHostLeaseJudgement(lease(3), lease(4))).toBe("stale");
  });

  it("judges another holder on the same epoch a mismatch, by role or brief", () => {
    expect(clientGatewayHostLeaseJudgement(lease(4, "brief-2"), lease(4))).toBe("holder_mismatch");
    expect(clientGatewayHostLeaseJudgement({ ...lease(4), holder: { role: "repairer", briefId: "brief-1" } }, lease(4))).toBe("holder_mismatch");
  });
});
