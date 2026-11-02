import { describe, expect, it } from "vitest";
import type { ClientGatewayActionResult } from "@fluxiq/contracts/client-gateway";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler, type AutomationStudioHostResourceLease } from "../index.ts";
import { StubHost } from "./stub-host.ts";
import { connectClient, pairedClient, leasedGateway, onSession, wire, deferred } from "./gateway-fixtures.ts";

describe("AutomationStudioHostLeaseScope", () => {
  it("stamps the scope's lease on every command issued inside it, and none outside", async () => {
    const { gateway, actions, act } = await pairedClient();
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })));
    const seen = await scope.run({ role: "builder", briefId: "brief.a" }, async (lease) => {
      expect(AutomationStudioHostLeaseScope.current()).toBe(lease);
      expect((await act()).status).toBe("succeeded");
      expect((await act()).status).toBe("succeeded");
      return lease;
    });
    expect(AutomationStudioHostLeaseScope.current()).toBeUndefined();
    expect((await act()).status).toBe("succeeded");
    expect(actions.map((payload) => payload.lease)).toEqual([wire(seen), wire(seen), undefined]);
    expect(Object.hasOwn(actions[2]!, "lease")).toBe(false);
    await gateway.close();
  });

  it("two scopes running at once on a capacity-2 host each stamp their own lease", async () => {
    const { gateway, actions, act } = await pairedClient();
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 2 })));
    const bothIn = { count: 0, gate: deferred() };
    const work = (actionType: string) => async (lease: AutomationStudioHostResourceLease) => {
      bothIn.count += 1;
      if (bothIn.count === 2) bothIn.gate.resolve();
      await bothIn.gate.promise;
      await act(`${actionType}.1`);
      await act(`${actionType}.2`);
      return lease;
    };
    const [a, b] = await Promise.all([
      scope.run({ role: "builder", briefId: "brief.a" }, work("a")),
      scope.run({ role: "builder", briefId: "brief.b" }, work("b"))
    ]);
    expect(a.resourceKey).not.toBe(b.resourceKey);
    for (const payload of actions) {
      expect(payload.lease).toEqual(String(payload.actionType).startsWith("a.") ? wire(a) : wire(b));
    }
    expect(actions).toHaveLength(4);
    await gateway.close();
  });

  it("refuses, unsent, a command a holder issues after its lease was released", async () => {
    const { gateway, actions, act } = await pairedClient();
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })), { strict: false });
    const released = deferred();
    let late: Promise<ClientGatewayActionResult> | undefined;
    await scope.run({ role: "builder", briefId: "brief.a" }, async () => {
      late = released.promise.then(() => act("late"));
    });
    released.resolve();
    const result = await late!;
    expect(result).toMatchObject({ status: "failed", failure: { code: "host_lease.stale", category: "blocked_by_capability_or_policy", retryable: false, stage: "dispatch", effect: "unacted" } });
    expect(actions).toEqual([]);
    await gateway.close();
  });

  it("strict mode refuses an unleased command while a lease is held, and not once it is released", async () => {
    const { gateway, actions, act } = await pairedClient();
    const strict = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })));
    const holding = deferred();
    const done = deferred();
    const run = strict.run({ role: "builder", briefId: "brief.a" }, async () => {
      holding.resolve();
      await done.promise;
    });
    await holding.promise;
    expect((await act("outside")).failure?.code).toBe("host_lease.missing");
    done.resolve();
    await run;
    expect((await act("after")).status).toBe("succeeded");
    expect(actions.map((payload) => payload.actionType)).toEqual(["after"]);

    const lenient = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })), { strict: false });
    await lenient.run({ role: "builder", briefId: "brief.b" }, async () => {
      expect(AutomationStudioHostLeaseScope.gatewaySource.requiresLease("any.session")).toBe(false);
    });
    await gateway.close();
  });

  it("a strict lease on session A refuses an unleased command to A and lets one to session B through", async () => {
    const gateway = leasedGateway();
    const a = await connectClient(gateway, "client.a");
    const b = await connectClient(gateway, "client.b");
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(onSession(new StubHost({ capacity: 1 }), a.sessionId)));
    const holding = deferred();
    const done = deferred();
    const run = scope.run({ role: "builder", briefId: "brief.a" }, async (lease) => {
      expect(lease.sessionId).toBe(a.sessionId);
      holding.resolve();
      await done.promise;
    });
    await holding.promise;
    expect((await a.act("to.a")).failure?.code).toBe("host_lease.missing");
    expect((await b.act("to.b")).status).toBe("succeeded");
    done.resolve();
    await run;
    expect(a.actions).toEqual([]);
    expect(b.actions.map((payload) => payload.actionType)).toEqual(["to.b"]);
    expect(Object.hasOwn(b.actions[0]!, "lease")).toBe(false);
    await gateway.close();
  });

  it("a strict lease whose grant names no session refuses unleased commands to every session", async () => {
    const gateway = leasedGateway();
    const a = await connectClient(gateway, "client.a");
    const b = await connectClient(gateway, "client.b");
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(new StubHost({ capacity: 1 })));
    const holding = deferred();
    const done = deferred();
    const run = scope.run({ role: "builder", briefId: "brief.a" }, async (lease) => {
      expect(lease.sessionId).toBeUndefined();
      holding.resolve();
      await done.promise;
    });
    await holding.promise;
    expect((await a.act("to.a")).failure?.code).toBe("host_lease.missing");
    expect((await b.act("to.b")).failure?.code).toBe("host_lease.missing");
    done.resolve();
    await run;
    expect([...a.actions, ...b.actions]).toEqual([]);
    await gateway.close();
  });
});
