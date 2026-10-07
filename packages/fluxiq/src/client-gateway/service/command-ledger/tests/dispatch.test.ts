import { describe, expect, it, vi } from "vitest";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActionResult, type ClientGatewayClientMessage } from "../../../index.ts";
import { ClientGatewayCommandContext as Context, ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandLedgerLease, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../index.ts";

const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "node.attempt.1", effectOrdinal: 0 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function memory(): ClientGatewayCommandLedgerPort {
  let saved: ClientGatewayCommandRecord | null = null;
  return {
    claim: vi.fn(async claim => { const sendAllowed = saved === null; saved ??= { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending", receipt: null, committedAt: null, unknownReason: null }; Rules.validateRecord(claim, saved); return { sendAllowed, record: saved }; }),
    commitReceipt: vi.fn(async (claim, receipt) => { if (!saved) throw new Error("missing"); saved = { ...saved, claim, state: "committed", receipt, committedAt: Date.now(), unknownReason: null }; Rules.validateRecord(claim, saved); return saved; }),
    markUnknown: vi.fn(async (_claim, reason) => { if (!saved) throw new Error("missing"); if (saved.state !== "committed") saved = { ...saved, state: "unknown", unknownReason: reason }; return saved; }),
    read: vi.fn(async () => saved)
  };
}
async function paired(gateway: ClientGatewayService, send?: (message: string) => void | Promise<void>, clientId = "client.1") {
  const session = gateway.connect(send ? { socket: { send } } : {});
  await gateway.receive(session.sessionId, { id: "hello.1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId, clientType: "extension", capabilities: [] } });
  const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === session.sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" }); gateway.clearOutbound(session.sessionId); return session.sessionId;
}
function ack(commandId: string, fields: Partial<ClientGatewayActionResult> = {}): ClientGatewayClientMessage {
  return { id: "ack.1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId, status: "succeeded", payload: { records: ["synthetic"] }, ...fields } };
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
describe("actual gateway explicit durable dispatch boundary", () => {
  it("delays all enqueue/send until claim and all public resolution/events until receipt commit", async () => {
    const ledger = memory(), claimGate = deferred<void>(), receiptGate = deferred<void>(), close = vi.fn(async () => undefined);
    const originalClaim = ledger.claim, originalReceipt = ledger.commitReceipt;
    ledger.claim = async claim => { await claimGate.promise; return originalClaim(claim); };
    ledger.commitReceipt = async (claim, receipt) => { await receiptGate.promise; return originalReceipt(claim, receipt); };
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close }) }), sends: unknown[] = [], events: unknown[] = [];
    const sessionId = await paired(gateway, raw => { const message = JSON.parse(raw); if (message.type === "server.execute_action") sends.push(message); });
    gateway.onEvent(event => { if (event.type === "client.action_result") events.push(event.message.payload); });
    const command = { actionType: "synthetic.action", parameters: { list: [1, 2] } };
    const response = gateway.executeAction(sessionId, command, { context: Context.issue(owner) }); let resolved = false; void response.result.then(() => { resolved = true; });
    command.parameters.list.reverse(); await tick(); expect(sends).toHaveLength(0); expect(gateway.outbound(sessionId)).toHaveLength(0);
    claimGate.resolve(); await tick(); expect(sends).toHaveLength(1); expect(sends[0]).toMatchObject({ payload: { parameters: { list: [1, 2] } } });
    const receive = gateway.receive(sessionId, ack(response.commandId)); await tick(); expect(resolved).toBe(false); expect(events).toHaveLength(0);
    receiptGate.resolve(); await receive; expect(await response.result).toMatchObject({ status: "completed", result: { status: "succeeded" } }); expect(events).toHaveLength(1); expect(close).toHaveBeenCalledTimes(1);
    await gateway.close();
  });
  it("malformed supplied options/context never falls back; missing port and unready permission refuse before sends", async () => {
    const send = vi.fn(), gateway = new ClientGatewayService(), sessionId = await paired(gateway, send); send.mockClear();
    for (const options of [undefined, null, {}, { context: owner }, { context: Object.create(Context.prototype) }, { context: Context.issue(owner), signal: {} }]) expect(() => gateway.executeAction(sessionId, { actionType: "synthetic.action" }, options as never)).toThrow();
    await expect(gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }).result).rejects.toThrow("storage_unavailable");
    const unpaired = gateway.connect({ socket: { send } }); expect(() => gateway.executeAction(unpaired.sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) })).toThrow();
    expect(send).not.toHaveBeenCalled(); expect(gateway.outbound(sessionId)).toHaveLength(0); await gateway.close();
  });
  it("wrong sender, malformed/oversize/provenance result and racing duplicates cannot reserve the right answer", async () => {
    const ledger = memory(), gate = deferred<void>(), original = ledger.commitReceipt;
    ledger.commitReceipt = vi.fn(async (claim, receipt) => { await gate.promise; return original(claim, receipt); });
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close: async () => undefined }) });
    const right = await paired(gateway, () => undefined), wrong = await paired(gateway, () => undefined, "client.wrong");
    const response = gateway.executeAction(right, { actionType: "synthetic.action" }, { context: Context.issue(owner) }); await tick();
    await gateway.receive(wrong, ack(response.commandId));
    await gateway.receive(right, ack(response.commandId, { payload: { huge: "x".repeat(300_000) } }));
    await gateway.receive(right, ack(response.commandId, { status: "success" as never }));
    const forged = ack(response.commandId); Reflect.set(forged.payload, "receiptId", "model.success"); await gateway.receive(right, forged);
    expect(ledger.commitReceipt).not.toHaveBeenCalled();
    const first = gateway.receive(right, ack(response.commandId)), duplicate = gateway.receive(right, ack(response.commandId, { payload: { wrong: true } }));
    await duplicate; await tick(); gate.resolve(); await first;
    expect(await response.result).toMatchObject({ status: "completed", result: { payload: { records: ["synthetic"] } } }); await gateway.close();
  });
  it.each(["timeout", "abort", "disconnect", "wire_unknown", "send_throw"])("%s is uncertain and replay never resends", async cause => {
    const ledger = memory(), close = vi.fn(async () => undefined), sends: number[] = [];
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20, resolveCommandLedger: async () => ({ ledger, close }) });
    const sessionId = await paired(gateway, raw => { if (JSON.parse(raw).type === "server.execute_action") { sends.push(1); if (cause === "send_throw") throw new Error("effect then throw"); } });
    const abort = new AbortController(), context = Context.issue(owner), response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context, signal: abort.signal }); await tick();
    if (cause === "abort") abort.abort();
    if (cause === "disconnect") gateway.disconnect(sessionId);
    if (cause === "wire_unknown") await gateway.receive(sessionId, ack(response.commandId, { status: "unknown" }));
    expect(await response.result).toEqual({ status: "outcome_unknown" }); expect(sends).toHaveLength(1); expect(close).toHaveBeenCalledTimes(1);
    if (cause !== "disconnect") { expect(await gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context }).result).toEqual({ status: "outcome_unknown" }); expect(sends).toHaveLength(1); }
    await gateway.close();
  });
  it("no socket cannot enqueue a durable command, while legacy context-free remains unchanged", async () => {
    const ledger = memory(), gateway = new ClientGatewayService({ commandTimeoutMs: 20, resolveCommandLedger: async () => ({ ledger, close: async () => undefined }) });
    const sessionId = await paired(gateway);
    expect(await gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }).result).toEqual({ status: "outcome_unknown" }); expect(gateway.outbound(sessionId)).toHaveLength(0);
    const legacy = gateway.executeAction(sessionId, { actionType: "synthetic.action" }); await gateway.receive(sessionId, ack(legacy.commandId)); expect((await legacy.result).status).toBe("succeeded"); await gateway.close();
  });
  it("abort during a delayed claim gives zero sends and close awaits release without lease leaks", async () => {
    const ledger = memory(), gate = deferred<void>(), close = vi.fn(async () => undefined), original = ledger.claim;
    ledger.claim = async claim => { await gate.promise; return original(claim); };
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close }) }), send = vi.fn(), sessionId = await paired(gateway, send); send.mockClear();
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }); let closed = false; const closing = gateway.close().then(() => { closed = true; });
    await tick(); expect(closed).toBe(false); gate.resolve(); expect(await response.result).toEqual({ status: "outcome_unknown" }); await closing;
    expect(send).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1); expect(() => gateway.executeAction(sessionId, { actionType: "synthetic.action" })).toThrow("closed");
  });
  it("receipt COMMIT lost acknowledgement and racing abort preserve committed result; cleanup error surfaces on close", async () => {
    const ledger = memory(), original = ledger.commitReceipt, abort = new AbortController();
    ledger.commitReceipt = async (claim, receipt) => { const saved = await original(claim, receipt); abort.abort(); expect(saved.state).toBe("committed"); throw new Error("lost commit ack"); };
    const lease: ClientGatewayCommandLedgerLease = { ledger, close: async () => { throw new Error("owned cleanup error"); } };
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => lease }), sessionId = await paired(gateway, () => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner), signal: abort.signal }); await tick(); await gateway.receive(sessionId, ack(response.commandId));
    expect(await response.result).toMatchObject({ status: "completed" }); await expect(gateway.close()).rejects.toThrow("lease_cleanup_failed");
  });
  it("failing claim closes its lease with zero sends; failing receipt leaves unknown instead of publishing success", async () => {
    const ledger = memory(), close = vi.fn(async () => undefined), gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close }) }), sends: number[] = [];
    const sessionId = await paired(gateway, raw => { if (JSON.parse(raw).type === "server.execute_action") sends.push(1); });
    const original = ledger.claim;
    ledger.claim = async () => { throw new Error("owned claim failure"); };
    await expect(gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }).result).rejects.toThrow("owned claim failure"); expect(sends).toHaveLength(0); expect(close).toHaveBeenCalledTimes(1);
    ledger.claim = original; ledger.commitReceipt = async () => { throw new Error("owned receipt failure"); };
    const events: unknown[] = []; gateway.onEvent(event => { if (event.type === "client.action_result") events.push(event); });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }); await tick(); await gateway.receive(sessionId, ack(response.commandId));
    expect(await response.result).toEqual({ status: "outcome_unknown" }); expect(events).toHaveLength(0); expect(close).toHaveBeenCalledTimes(2); await gateway.close();
  });
});
