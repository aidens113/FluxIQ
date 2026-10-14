// The host lease on durable action commands (automation-project-agents-plan,
// `Host resources and concurrency`): stamped before the request digest, so the
// claim covers it; a malformed one is an invalid command; a stale, foreign or
// missing one throws before anything is claimed.
import { describe, expect, it, vi } from "vitest";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActionCommand, type ClientGatewayHostLease, type ClientGatewayServiceOptions } from "../../../index.ts";
import type { ClientGatewayHostLeaseSource } from "../../host-lease/index.ts";
import { ClientGatewayCommandContext as Context, ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../index.ts";

const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "node.attempt.1", effectOrdinal: 0 };
const lease: ClientGatewayHostLease = { resourceKey: "resource-1", epoch: 5, holder: { role: "builder", briefId: "brief.a" } };

function memory(): ClientGatewayCommandLedgerPort {
  let saved: ClientGatewayCommandRecord | null = null;
  return {
    claim: vi.fn(async (claim) => {
      const sendAllowed = saved === null;
      saved ??= { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending", receipt: null, committedAt: null, unknownReason: null };
      return { sendAllowed, record: saved };
    }),
    commitReceipt: vi.fn(async (claim, receipt) => {
      saved = { ...saved!, claim, state: "committed", receipt, committedAt: Date.now(), unknownReason: null };
      return saved;
    }),
    markUnknown: vi.fn(async (_claim, reason) => {
      saved = { ...saved!, state: "unknown", unknownReason: reason };
      return saved;
    }),
    read: vi.fn(async () => saved)
  };
}

/** `strict` true is strict for every session; a session id is strict for that session only. */
function source(input: { scoped?: ClientGatewayHostLease; current?: boolean; strict?: boolean | string }): ClientGatewayHostLeaseSource {
  return { current: () => input.scoped, isCurrent: () => input.current ?? true, requiresLease: (sessionId) => input.strict === true || input.strict === sessionId };
}

async function paired(options: Pick<ClientGatewayServiceOptions, "hostLease"> = {}) {
  const ledger = memory();
  const resolveCommandLedger = vi.fn(async () => ({ ledger, close: async () => undefined }));
  const sent: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const gateway = new ClientGatewayService({ ...options, resolveCommandLedger });
  const session = gateway.connect({ socket: { send: (raw: string) => { sent.push(JSON.parse(raw)); } } });
  await gateway.receive(session.sessionId, { id: "hello.1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "client.1", clientType: "extension", capabilities: [] } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  gateway.clearOutbound(session.sessionId);
  const actions = () => sent.filter((message) => message.type === "server.execute_action").map((message) => message.payload);
  return { gateway, sessionId: session.sessionId, ledger, resolveCommandLedger, actions };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function answer(gateway: ClientGatewayService, sessionId: string, commandId: string): Promise<void> {
  await gateway.receive(sessionId, { id: "ack.1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId, status: "succeeded" } });
}

describe("durable dispatch host lease", () => {
  it("digests and sends the command as it was before leases when none is in scope", async () => {
    const command: ClientGatewayActionCommand = { actionType: "synthetic.act", parameters: { n: 1 } };
    const { gateway, sessionId, ledger, actions } = await paired({ hostLease: source({}) });
    const response = gateway.executeAction(sessionId, command, { context: Context.issue(owner) });
    await tick();
    expect(vi.mocked(ledger.claim).mock.calls[0]![0].requestDigest).toBe(Rules.digest(command));
    expect(actions()).toEqual([{ ...command, commandId: response.commandId }]);
    await answer(gateway, sessionId, response.commandId);
    expect((await response.result).status).toBe("completed");
    await gateway.close();
  });

  it("stamps the scope's lease before the request digest and sends it", async () => {
    const command: ClientGatewayActionCommand = { actionType: "synthetic.act" };
    const { gateway, sessionId, ledger, actions } = await paired({ hostLease: source({ scoped: lease }) });
    const response = gateway.executeAction(sessionId, command, { context: Context.issue(owner) });
    await tick();
    const digest = vi.mocked(ledger.claim).mock.calls[0]![0].requestDigest;
    expect(digest).toBe(Rules.digest({ ...command, lease }));
    expect(digest).not.toBe(Rules.digest(command));
    expect(actions()).toEqual([{ actionType: "synthetic.act", lease, commandId: response.commandId }]);
    await answer(gateway, sessionId, response.commandId);
    expect((await response.result).status).toBe("completed");
    await gateway.close();
  });

  it("refuses a malformed lease as an invalid command", async () => {
    const { gateway, sessionId, resolveCommandLedger } = await paired({ hostLease: source({ scoped: lease }) });
    for (const malformed of [{ ...lease, epoch: "5" }, { ...lease, holder: { role: "builder" } }, null]) {
      expect(() => gateway.executeAction(sessionId, { actionType: "synthetic.act", lease: malformed as unknown as ClientGatewayHostLease }, { context: Context.issue(owner) })).toThrow("durable_command.invalid_command");
    }
    expect(resolveCommandLedger).not.toHaveBeenCalled();
    await gateway.close();
  });

  it.each([
    ["stale", source({ scoped: lease, current: false }), {}, "durable_command.host_lease.stale"],
    ["forged", source({ scoped: lease }), { lease: { ...lease, epoch: 4 } }, "durable_command.host_lease.holder_mismatch"],
    ["missing under strict mode", source({ strict: true }), {}, "durable_command.host_lease.missing"]
  ])("throws on a %s lease before the claim, sending nothing", async (_name, hostLease, extra, message) => {
    const { gateway, sessionId, ledger, resolveCommandLedger, actions } = await paired({ hostLease });
    expect(() => gateway.executeAction(sessionId, { actionType: "synthetic.act", ...extra }, { context: Context.issue(owner) })).toThrow(message);
    await tick();
    expect(resolveCommandLedger).not.toHaveBeenCalled();
    expect(ledger.claim).not.toHaveBeenCalled();
    expect(actions()).toEqual([]);
    await gateway.close();
  });

  it("strict mode on another session lets the durable command through", async () => {
    const { gateway, sessionId, ledger, actions } = await paired({ hostLease: source({ strict: "session.elsewhere" }) });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.act" }, { context: Context.issue(owner) });
    await tick();
    expect(ledger.claim).toHaveBeenCalledTimes(1);
    expect(actions()).toEqual([{ actionType: "synthetic.act", commandId: response.commandId }]);
    await answer(gateway, sessionId, response.commandId);
    expect((await response.result).status).toBe("completed");
    await gateway.close();
  });
});
