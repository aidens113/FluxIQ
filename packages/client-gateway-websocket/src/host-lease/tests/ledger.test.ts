// The highest host lease seen per resource: what it adopts, what it refuses,
// that a restarted client still knows it, that two judgements at once cannot
// leave the lower epoch kept, and the verdict on a lease as it came off the wire.

import { describe, expect, it } from "vitest";
import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { clientGatewayMemoryArea, type ClientGatewayStorageArea } from "../../storage-area/index.ts";
import { ClientGatewayHostLeaseLedger } from "../index.ts";

const lease = (epoch: number, briefId = "brief-1", resourceKey = "demo.resource:client-a"): ClientGatewayHostLease => ({ resourceKey, epoch, holder: { role: "builder", briefId } });

describe("ClientGatewayHostLeaseLedger.admit", () => {
  it("adopts a first lease; the same one is current; a lower epoch is stale; another holder on the same epoch is a mismatch", async () => {
    const ledger = new ClientGatewayHostLeaseLedger(clientGatewayMemoryArea());
    expect(await ledger.admit(lease(4))).toEqual({ judgement: "adopt", seen: undefined });
    expect(await ledger.admit(lease(4))).toEqual({ judgement: "current", seen: lease(4) });
    expect(await ledger.admit(lease(3, "brief-0"))).toEqual({ judgement: "stale", seen: lease(4) });
    expect(await ledger.admit(lease(4, "brief-2"))).toEqual({ judgement: "holder_mismatch", seen: lease(4) });
    expect(await ledger.admit(lease(5, "brief-2"))).toEqual({ judgement: "adopt", seen: lease(4) });
    expect((await ledger.admit(lease(4))).judgement, "the higher epoch is the one kept").toBe("stale");
  });

  it("keeps each resource key's own highest lease", async () => {
    const ledger = new ClientGatewayHostLeaseLedger(clientGatewayMemoryArea());
    await ledger.admit(lease(9));
    expect((await ledger.admit(lease(2, "brief-1", "demo.resource:client-b"))).judgement).toBe("adopt");
  });

  it("judges a restarted client against what the one before it kept, under the default key prefix", async () => {
    const area = clientGatewayMemoryArea();
    await new ClientGatewayHostLeaseLedger(area).admit(lease(7));
    expect(Object.keys(await area.get(null))).toEqual(["fluxiq.hostLease.demo.resource:client-a"]);
    const restarted = new ClientGatewayHostLeaseLedger(area);
    expect(await restarted.admit(lease(6, "brief-0"))).toEqual({ judgement: "stale", seen: lease(7) });
    expect((await restarted.admit(lease(7))).judgement).toBe("current");
  });

  it("keeps leases under the key prefix it is given", async () => {
    const area = clientGatewayMemoryArea();
    await new ClientGatewayHostLeaseLedger(area, { keyPrefix: "demo.lease." }).admit(lease(3));
    expect(Object.keys(await area.get(null))).toEqual(["demo.lease.demo.resource:client-a"]);
    expect((await new ClientGatewayHostLeaseLedger(area).admit(lease(1))).judgement, "another prefix is another ledger").toBe("adopt");
  });

  it("treats a stored value that is not a lease as none", async () => {
    const area = clientGatewayMemoryArea();
    await area.set({ "fluxiq.hostLease.demo.resource:client-a": { epoch: "seven" } });
    expect(await new ClientGatewayHostLeaseLedger(area).admit(lease(1))).toEqual({ judgement: "adopt", seen: undefined });
  });

  it("judges two leases at once in turn, so the lower epoch is never the one kept", async () => {
    const area = clientGatewayMemoryArea();
    const slow: ClientGatewayStorageArea = {
      get: async (keys) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return await area.get(keys);
      },
      set: area.set,
      remove: area.remove
    };
    const ledger = new ClientGatewayHostLeaseLedger(slow);
    const [higher, lower] = await Promise.all([ledger.admit(lease(6, "brief-2")), ledger.admit(lease(5))]);
    expect(higher.judgement).toBe("adopt");
    expect(lower.judgement).toBe("stale");
    expect((await new ClientGatewayHostLeaseLedger(area).admit(lease(5))).judgement, "storage holds epoch 6").toBe("stale");
  });

  it("hands a storage fault back, and the lease it already judged still counts", async () => {
    const area = clientGatewayMemoryArea();
    let failing = false;
    const flaky: ClientGatewayStorageArea = {
      get: async (keys) => {
        if (failing) throw new Error("storage unavailable");
        return await area.get(keys);
      },
      set: async (items) => {
        if (failing) throw new Error("storage unavailable");
        await area.set(items);
      },
      remove: area.remove
    };
    const ledger = new ClientGatewayHostLeaseLedger(flaky);
    await ledger.admit(lease(4));
    failing = true;
    expect(await ledger.admit(lease(3)), "memory answers without storage").toEqual({ judgement: "stale", seen: lease(4) });
    const adopted = await ledger.admit(lease(5));
    expect(adopted.judgement).toBe("adopt");
    expect(String(adopted.fault)).toMatch(/storage unavailable/u);
    expect((await ledger.admit(lease(4))).judgement, "the adopted lease is kept in memory").toBe("stale");
    const unread = await new ClientGatewayHostLeaseLedger(flaky).admit(lease(1));
    expect(unread.judgement, "a read fault with nothing in memory adopts").toBe("adopt");
    expect(String(unread.fault)).toMatch(/storage unavailable/u);
  });
});

describe("ClientGatewayHostLeaseLedger.verdict", () => {
  it("lets a command with no lease run, untouched", async () => {
    const area = clientGatewayMemoryArea();
    expect(await new ClientGatewayHostLeaseLedger(area).verdict("cmd-1", undefined, () => 10)).toEqual({});
    expect(await area.get(null)).toEqual({});
  });

  it("refuses a lease it cannot read as missing", async () => {
    const verdict = await new ClientGatewayHostLeaseLedger(clientGatewayMemoryArea()).verdict("cmd-1", { epoch: 1 }, () => 10);
    expect(verdict.refusal?.failure?.code).toBe("host_lease.missing");
    expect(verdict.refusal?.startedAt).toBe(10);
    expect(verdict.fault).toBeUndefined();
  });

  it("lets an adopted lease run, and refuses a stale one naming the epoch seen", async () => {
    const ledger = new ClientGatewayHostLeaseLedger(clientGatewayMemoryArea());
    expect(await ledger.verdict("cmd-1", lease(4), () => 10)).toEqual({});
    const stale = await ledger.verdict("cmd-2", lease(3), () => 20);
    expect(stale.refusal?.commandId).toBe("cmd-2");
    expect(stale.refusal?.failure?.code).toBe("host_lease.stale");
    expect(stale.refusal?.failure?.actual).toMatch(/epoch 4/u);
    const mismatch = await ledger.verdict("cmd-3", lease(4, "brief-2"), () => 30);
    expect(mismatch.refusal?.failure?.code).toBe("host_lease.holder_mismatch");
  });

  it("hands back a storage fault beside the verdict", async () => {
    const failing: ClientGatewayStorageArea = {
      get: async () => {
        throw new Error("storage unavailable");
      },
      set: async () => undefined,
      remove: async () => undefined
    };
    const verdict = await new ClientGatewayHostLeaseLedger(failing).verdict("cmd-1", lease(1), () => 10);
    expect(verdict.refusal).toBeUndefined();
    expect(String(verdict.fault)).toMatch(/storage unavailable/u);
  });
});
