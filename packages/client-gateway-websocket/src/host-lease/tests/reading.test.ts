// A command's host lease as a client reads it: none, a lease, or one it cannot read.

import { describe, expect, it } from "vitest";
import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { clientGatewayHostLeaseReading } from "../index.ts";

const lease = (epoch: number, briefId = "brief-1"): ClientGatewayHostLease => ({ resourceKey: "demo.resource:client-a", epoch, holder: { role: "builder", briefId } });

describe("clientGatewayHostLeaseReading", () => {
  it("reads no lease as none", () => {
    expect(clientGatewayHostLeaseReading(undefined)).toEqual({ kind: "none" });
  });

  it("reads a lease field by field, copying only the fields the contract names", () => {
    expect(clientGatewayHostLeaseReading({ ...lease(4), extra: "dropped", holder: { role: "builder", briefId: "brief-1", note: "dropped" } }))
      .toEqual({ kind: "lease", lease: lease(4) });
    expect(clientGatewayHostLeaseReading(lease(0))).toEqual({ kind: "lease", lease: lease(0) });
  });

  it("reads anything else as unreadable", () => {
    for (const unreadable of [
      null,
      "lease",
      [],
      { epoch: 4, holder: { role: "builder", briefId: "b" } },
      { resourceKey: "", epoch: 4, holder: { role: "builder", briefId: "b" } },
      { resourceKey: "k", epoch: 4.5, holder: { role: "builder", briefId: "b" } },
      { resourceKey: "k", epoch: -1, holder: { role: "builder", briefId: "b" } },
      { resourceKey: "k", epoch: 4 },
      { resourceKey: "k", epoch: 4, holder: { role: "builder" } },
      { resourceKey: "k", epoch: 4, holder: { role: "", briefId: "b" } }
    ]) {
      expect(clientGatewayHostLeaseReading(unreadable), JSON.stringify(unreadable)).toEqual({ kind: "unreadable" });
    }
  });
});
