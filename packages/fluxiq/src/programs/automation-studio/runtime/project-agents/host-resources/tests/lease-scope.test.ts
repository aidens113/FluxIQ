// The lease scope end to end through Core's real client gateway
// (automation-project-agents-plan, `Host resources and concurrency`): every
// host command issued inside a scope carries its lease, two scopes at once
// stamp their own, and a released lease or an unleased command under strict
// mode is refused before it is sent.
import type { ClientGatewayActionResult, ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import { describe, expect, it } from "vitest";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../../../../client-gateway/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { runCanonicalAutomationStudioFlow, type AutomationStudioHostRuntimeBoundary } from "../../../index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler, type AutomationStudioHostResourceLease, type AutomationStudioHostResourcePort } from "../index.ts";
import { StubHost } from "./stub-host.ts";

/** A client paired on `gateway` that answers every action at once, and the action payloads it was sent. */
async function connectClient(gateway: ClientGatewayService, clientId: string) {
  const actions: Array<Record<string, unknown>> = [];
  let sessionId = "";
  const session = gateway.connect({
    socket: {
      send: (raw: string) => {
        const message = JSON.parse(raw) as { type: string; payload: Record<string, unknown> };
        if (message.type !== "server.execute_action") return;
        actions.push(message.payload);
        setTimeout(() => void gateway.receive(sessionId, { id: `ack.${actions.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: String(message.payload.commandId), status: "succeeded" } }), 0);
      }
    }
  });
  sessionId = session.sessionId;
  await gateway.receive(sessionId, { id: `hello.${clientId}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId, clientType: "extension", capabilities: [] } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  gateway.clearOutbound(sessionId);
  const act = (actionType = "synthetic.act"): Promise<ClientGatewayActionResult> => gateway.executeAction(sessionId, { actionType }).result;
  return { sessionId, actions, act };
}

function leasedGateway(): ClientGatewayService {
  return new ClientGatewayService({ commandTimeoutMs: 2_000, hostLease: AutomationStudioHostLeaseScope.gatewaySource });
}

/** One paired client on a gateway wired to the lease scope. */
async function pairedClient() {
  const gateway = leasedGateway();
  return { gateway, ...(await connectClient(gateway, "client.1")) };
}

/** The stub host, with every grant naming the gateway session its resource lives on. */
function onSession(host: StubHost, sessionId: string): AutomationStudioHostResourcePort {
  return {
    capacity: host.capacity,
    acquire: async (holder) => {
      const grant = await host.acquire(holder);
      return grant === "at_capacity" ? grant : { ...grant, sessionId };
    },
    release: (lease) => host.release(lease)
  };
}

function wire(lease: AutomationStudioHostResourceLease): ClientGatewayHostLease {
  return { resourceKey: lease.resourceKey, epoch: lease.epoch, holder: { role: lease.holder.role, briefId: lease.holder.briefId } };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

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

  it("a trial run inside a scope stamps every command it dispatches", async () => {
    const { gateway, actions, act } = await pairedClient();
    const host = new StubHost({ capacity: 1 });
    const hostRuntime: AutomationStudioHostRuntimeBoundary = { capabilities: ["action-dispatch"], hostResources: host };
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler(hostRuntime.hostResources!));
    const edge = (source: string, target: string) => ({ id: `${source}.${target}`, sourceNodeId: source, sourcePortId: "success", targetNodeId: target, targetPortId: "in" });
    const flow = {
      ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.lease", projectId: "project", name: "Lease", now: 1 }),
      nodes: [
        { id: "start", definitionId: "builtin.control.start" },
        { id: "first", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.first" } },
        { id: "second", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.second" } },
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [edge("start", "first"), edge("first", "second"), edge("second", "end")]
    };
    const { lease, trace } = await scope.run({ role: "builder", briefId: "brief.trial" }, async (held) => ({
      lease: held,
      trace: await runCanonicalAutomationStudioFlow(flow, [], {
        hostRuntime,
        effectDispatcher: async () => {
          const result = await act("trial.act");
          return result.status === "succeeded" ? { status: "success", route: "success", outputs: {} } : { status: "failed", route: "failed", outputs: {} };
        }
      })
    }));
    expect(trace.status).toBe("succeeded");
    expect(actions.length).toBeGreaterThanOrEqual(2);
    for (const payload of actions) expect(payload.lease).toEqual(wire(lease));
    expect(host.inUse()).toBe(0);
    await gateway.close();
  });
});
