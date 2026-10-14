// The host lease on non-durable action commands (automation-project-agents-plan,
// `Host resources and concurrency`): stamped from the dispatching scope, and a
// stale, foreign or missing one refused before anything is sent.
import { parseAutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActionCommand, type ClientGatewayHostLease, type ClientGatewayServiceOptions } from "../../index.ts";
import type { ClientGatewayHostLeaseSource } from "../host-lease/index.ts";

const lease: ClientGatewayHostLease = { resourceKey: "resource-1", epoch: 2, holder: { role: "builder", briefId: "brief.a" } };

async function connectClient(gateway: ClientGatewayService, clientId: string) {
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const session = gateway.connect({ socket: { send: (raw: string) => { sent.push(JSON.parse(raw)); } } });
  await gateway.receive(session.sessionId, { id: `hello.${clientId}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId, clientType: "extension", capabilities: [] } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  gateway.clearOutbound(session.sessionId);
  sent.length = 0;
  const actions = () => sent.filter((message) => message.type === "server.execute_action").map((message) => message.payload);
  return { sessionId: session.sessionId, actions };
}

async function paired(options: ClientGatewayServiceOptions = {}) {
  const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, ...options });
  return { gateway, ...(await connectClient(gateway, "client.1")) };
}

function source(input: { scoped?: ClientGatewayHostLease; current?: boolean; strict?: boolean }): ClientGatewayHostLeaseSource {
  return { current: () => input.scoped, isCurrent: () => input.current ?? true, requiresLease: () => input.strict ?? false };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("client gateway host lease on action commands", () => {
  it("sends today's payload byte for byte when no lease is in scope", async () => {
    const command: ClientGatewayActionCommand = { actionType: "synthetic.act", parameters: { list: [1, 2] }, timeoutMs: 500 };
    for (const options of [{}, { hostLease: source({}) }]) {
      const { gateway, sessionId, actions } = await paired(options);
      const response = gateway.executeAction(sessionId, command);
      await flush();
      expect(JSON.stringify(actions())).toBe(JSON.stringify([{ ...command, commandId: response.commandId }]));
      await gateway.close();
    }
  });

  it("stamps the scope's lease on the command it sends", async () => {
    const { gateway, sessionId, actions } = await paired({ hostLease: source({ scoped: lease }) });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.act" });
    await flush();
    expect(actions()).toEqual([{ actionType: "synthetic.act", lease, commandId: response.commandId }]);
    expect(response.message.payload).toMatchObject({ lease });
    await gateway.close();
  });

  it.each([
    ["stale", source({ scoped: lease, current: false }), {}, "host_lease.stale"],
    ["forged", source({ scoped: lease }), { lease: { ...lease, epoch: 1 } }, "host_lease.holder_mismatch"],
    ["supplied without a scope", source({}), { lease }, "host_lease.holder_mismatch"],
    ["missing under strict mode", source({ strict: true }), {}, "host_lease.missing"]
  ])("refuses a %s lease unsent, answering failed and unacted", async (_name, hostLease, extra, code) => {
    const { gateway, sessionId, actions } = await paired({ hostLease });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.act", ...extra });
    const result = await response.result;
    await flush();
    expect(actions()).toEqual([]);
    expect(result).toMatchObject({ commandId: response.commandId, status: "failed" });
    expect(parseAutomationStudioFailureRecord(result.failure)).toEqual({ category: "blocked_by_capability_or_policy", code, retryable: false, stage: "dispatch", effect: "unacted" });
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "command.host_lease_refused")).toBe(true);
    await gateway.close();
  });

  it("strict mode refuses an unleased command only to the session a lease is held on", async () => {
    const strictSessions = new Set<string>();
    const hostLease: ClientGatewayHostLeaseSource = { current: () => undefined, isCurrent: () => true, requiresLease: (sessionId) => strictSessions.has(sessionId) };
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, hostLease });
    const a = await connectClient(gateway, "client.a");
    const b = await connectClient(gateway, "client.b");
    strictSessions.add(a.sessionId);
    const refused = await gateway.executeAction(a.sessionId, { actionType: "to.a" }).result;
    const sentToB = gateway.executeAction(b.sessionId, { actionType: "to.b" });
    await flush();
    expect(refused.failure?.code).toBe("host_lease.missing");
    expect(a.actions()).toEqual([]);
    expect(b.actions()).toEqual([{ actionType: "to.b", commandId: sentToB.commandId }]);
    await gateway.close();
  });
});
