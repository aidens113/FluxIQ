import type { ClientGatewayActionCommand, ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import { clientGatewayHostLeaseStamp, type ClientGatewayHostLeaseSource } from "../index.ts";

const lease: ClientGatewayHostLease = { resourceKey: "resource-1", epoch: 3, holder: { role: "builder", briefId: "brief.a" } };

function source(input: { scoped?: ClientGatewayHostLease; current?: boolean; strict?: boolean } = {}): ClientGatewayHostLeaseSource {
  return {
    current: () => input.scoped,
    isCurrent: () => input.current ?? true,
    requiresLease: () => input.strict ?? false
  };
}

describe("clientGatewayHostLeaseStamp", () => {
  it("returns the caller's own command when no source or no scope is in force", () => {
    const command: ClientGatewayActionCommand = { actionType: "synthetic.act", parameters: { n: 1 } };
    expect(clientGatewayHostLeaseStamp(command, undefined, "session.a").command).toBe(command);
    expect(clientGatewayHostLeaseStamp(command, source(), "session.a").command).toBe(command);
  });

  it("stamps a copy carrying only the scope lease's own fields", () => {
    const command: ClientGatewayActionCommand = { actionType: "synthetic.act" };
    const extra = { ...lease, internal: "never on the wire" } as ClientGatewayHostLease;
    const stamped = clientGatewayHostLeaseStamp(command, source({ scoped: extra }), "session.a");
    expect(stamped.command).toEqual({ actionType: "synthetic.act", lease });
    expect(command).toEqual({ actionType: "synthetic.act" });
  });

  it("accepts a caller lease equal to the scope's and refuses any other", () => {
    expect(clientGatewayHostLeaseStamp({ actionType: "a", lease: { ...lease, holder: { ...lease.holder } } }, source({ scoped: lease }), "session.a").command?.lease).toEqual(lease);
    for (const forged of [{ ...lease, epoch: 4 }, { ...lease, resourceKey: "resource-2" }, { ...lease, holder: { role: "builder", briefId: "brief.b" } }, { ...lease, holder: { role: "repair", briefId: "brief.a" } }]) {
      expect(clientGatewayHostLeaseStamp({ actionType: "a", lease: forged }, source({ scoped: lease }), "session.a").refused).toBe("host_lease.holder_mismatch");
    }
    expect(clientGatewayHostLeaseStamp({ actionType: "a", lease }, source(), "session.a").refused).toBe("host_lease.holder_mismatch");
    expect(clientGatewayHostLeaseStamp({ actionType: "a", lease }, undefined, "session.a").refused).toBe("host_lease.holder_mismatch");
    expect(clientGatewayHostLeaseStamp({ actionType: "a", lease: null as unknown as ClientGatewayHostLease }, source({ scoped: lease }), "session.a").refused).toBe("host_lease.holder_mismatch");
  });

  it("refuses a scope lease that is no longer current", () => {
    expect(clientGatewayHostLeaseStamp({ actionType: "a" }, source({ scoped: lease, current: false }), "session.a").refused).toBe("host_lease.stale");
  });

  it("strict mode refuses an unleased command only while a resource is held", () => {
    expect(clientGatewayHostLeaseStamp({ actionType: "a" }, source({ strict: true }), "session.a").refused).toBe("host_lease.missing");
    expect(clientGatewayHostLeaseStamp({ actionType: "a" }, source({ strict: false }), "session.a").refused).toBeUndefined();
    expect(clientGatewayHostLeaseStamp({ actionType: "a" }, source({ scoped: lease, strict: true }), "session.a").command?.lease).toEqual(lease);
  });

  it("asks strict mode about the session the command is addressed to", () => {
    const asked: string[] = [];
    const perSession: ClientGatewayHostLeaseSource = {
      current: () => undefined,
      isCurrent: () => true,
      requiresLease: (sessionId) => {
        asked.push(sessionId);
        return sessionId === "session.a";
      }
    };
    expect(clientGatewayHostLeaseStamp({ actionType: "a" }, perSession, "session.a").refused).toBe("host_lease.missing");
    expect(clientGatewayHostLeaseStamp({ actionType: "a" }, perSession, "session.b").command).toEqual({ actionType: "a" });
    expect(asked).toEqual(["session.a", "session.b"]);
  });
});
