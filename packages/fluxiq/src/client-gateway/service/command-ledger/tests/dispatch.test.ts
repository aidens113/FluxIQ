import { describe, expect, it, vi } from "vitest";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActionResult, type ClientGatewayClientMessage } from "../../../index.ts";
import { ClientGatewayCommandContext as Context, ClientGatewayCommandLedgerController as Rules, ClientGatewayCommandOutcome as Outcome, ClientGatewayDurableDispatch as Dispatch, clientGatewayCommandResultDigest, type ClientGatewayCommandLedgerLease, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../index.ts";
import { ClientGatewayCommandUnsentRefusal as Unsent } from "../unsent-refusal.ts";
import { CLIENT_GATEWAY_RECONCILE_ANSWER_METADATA_KEY } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayTimerSource } from "../../types.ts";

const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "node.attempt.1", effectOrdinal: 0 };
function deferred<T>() { let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve }; }
function memory(): ClientGatewayCommandLedgerPort {
  let saved: ClientGatewayCommandRecord | null = null;
  return {
    claim: vi.fn(async claim => { const sendAllowed = saved === null;
      saved ??= { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending", receipt: null, committedAt: null, unknownReason: null };
      Rules.validateRecord(claim, saved);
      return { sendAllowed, record: saved }; }),
    commitReceipt: vi.fn(async (claim, receipt) => { if (!saved) throw new Error("missing");
      saved = { ...saved, claim, state: "committed", receipt, committedAt: Date.now(), unknownReason: null };
      Rules.validateRecord(claim, saved);
      return saved; }),
    markUnknown: vi.fn(async (_claim, reason) => { if (!saved) throw new Error("missing");
      if (saved.state !== "committed") saved = { ...saved, state: "unknown", unknownReason: reason };
      return saved; }),
    read: vi.fn(async () => saved),
    refuseUnsent: vi.fn(async (claim, proof) => {
      if (!saved || saved.state !== "pending") throw new Error("not pending");
      saved = { ...saved, state: "refused_unsent", refusal: { ...Unsent.read(proof, claim) } };
      return saved;
    })
  };
}
async function paired(gateway: ClientGatewayService, send?: (message: string) => void | Promise<void>, clientId = "client.1", answersReconcile = false) {
  const session = gateway.connect(send ? { socket: { send } } : {});
  const capabilities = answersReconcile ? [{ id: "synthetic.actions", kind: "action" as const, actionTypes: ["synthetic.action"], metadata: { [CLIENT_GATEWAY_RECONCILE_ANSWER_METADATA_KEY]: true } }] : [];
  await gateway.receive(session.sessionId, { id: "hello.1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId, clientType: "extension", capabilities } });
  const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === session.sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  gateway.clearOutbound(session.sessionId);
  return session.sessionId;
}
function ack(commandId: string, fields: Partial<ClientGatewayActionResult> = {}): ClientGatewayClientMessage {
  return { id: "ack.1", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId, status: "succeeded", payload: { records: ["synthetic"] }, ...fields } };
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
/**
 * The gateway's answer waits, run by the test: `fireDue` ends every wait still
 * armed at once, as an event loop that stalled past them does, and a wait
 * cancelled first never fires, as with `clearTimeout`.
 */
function scriptedTimers() {
  const waits: Array<{ fire: () => void; cancelled: boolean; fired: boolean }> = [];
  const source: ClientGatewayTimerSource = (_wait, _delayMs, fire) => { const wait = { fire, cancelled: false, fired: false };
    waits.push(wait);
    return { cancel: () => { wait.cancelled = true; } }; };
  const armed = () => waits.filter(wait => !wait.cancelled && !wait.fired).length;
  const fireDue = () => { const due = waits.filter(wait => !wait.cancelled && !wait.fired);
    for (const wait of due) { wait.fired = true;
      wait.fire(); }
    return due.length; };
  return { source, armed, fireDue };
}
describe("actual gateway explicit durable dispatch boundary", () => {
  it.each(["succeeded", "failed"] as const)("commits and delivers one full large %s result through its required observer", async status => {
    const ledger = memory(), context = Context.issue(owner), events: ClientGatewayActionResult[] = [];
    const observer = {
      completed: vi.fn(async (proof: object) => {
        const value = Dispatch.readCompletionProof(proof, context, observer);
        expect(value.result.status).toBe(status);
        expect(value.receipt.resultDigest).toBe(clientGatewayCommandResultDigest(value.result));
        expect(Object.isFrozen(value.result.payload)).toBe(true);
        expect((await ledger.read(value.claim))?.receipt).toEqual(value.receipt);
      }),
      uncertain: vi.fn(async () => undefined)
    };
    Outcome.require(context, observer);
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close: async () => undefined }) });
    const sessionId = await paired(gateway, () => undefined);
    gateway.onEvent(event => { if (event.type === "client.action_result") events.push(event.message.payload); });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context });
    await tick();
    const result = { commandId: response.commandId, status, payload: { snapshot: { text: "legitimate page evidence ".repeat(16_000), values: new Array(70_000).fill(0) } }, ...(status === "failed" ? { failure: { category: "target_not_found" as const, code: "example.target.not_found", retryable: true, stage: "target_resolution" as const } } : {}) };
    expect(Buffer.byteLength(JSON.stringify(result))).toBeGreaterThan(Rules.HASH_LIMIT_BYTES);
    await gateway.receive(sessionId, ack(response.commandId, result));
    const completed = await response.result;
    expect(completed).toMatchObject({ status: "completed", result: { status } });
    if (completed.status !== "completed") throw new Error("Expected committed result.");
    expect(completed.receipt.resultDigest).toBe(clientGatewayCommandResultDigest(result));
    const changed = { ...result, payload: { ...result.payload, snapshot: { ...result.payload.snapshot, text: `${result.payload.snapshot.text}changed tail` } } };
    expect(clientGatewayCommandResultDigest(changed)).not.toBe(completed.receipt.resultDigest);
    expect(ledger.commitReceipt).toHaveBeenCalledTimes(1);
    expect(observer.completed).toHaveBeenCalledTimes(1);
    expect(observer.uncertain).not.toHaveBeenCalled();
    expect(events).toEqual([result]);
    expect(JSON.stringify(await ledger.read(expect.anything()))).not.toContain("legitimate page evidence");
    await gateway.close();
  });
  it("authenticates only the exact live dispatch proof, never equal JSON or an expired/copied proof", async () => {
    const ledger = memory(), context = Context.issue(owner);
    let saved!: object;
    const observer = { completed: vi.fn(async (proof: object) => { saved = proof;
      const value = Dispatch.readCompletionProof(proof, context, observer);
      expect(Rules.digest(value.result)).toBe(value.receipt.resultDigest);
      expect(Object.isFrozen(value.result.payload)).toBe(true);
      const stored = await ledger.read(value.claim);
      expect(stored?.receipt).toEqual(value.receipt);
      for (const forged of [JSON.parse(JSON.stringify(proof)), { ...value }, structuredClone(value.receipt)]) expect(() => Dispatch.readCompletionProof(forged, context, observer)).toThrow("foreign_completion_proof");
      expect(() => Dispatch.readCompletionProof(proof, Context.issue(owner), observer)).toThrow("foreign_completion_proof");
      expect(() => Dispatch.readCompletionProof(proof, context, { ...observer })).toThrow("foreign_completion_proof"); }), uncertain: vi.fn(async () => undefined) };
    Outcome.require(context, observer);
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close: async () => undefined }) }), sessionId = await paired(gateway, () => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context });
    await tick();
    await gateway.receive(sessionId, ack(response.commandId));
    expect((await response.result).status).toBe("completed");
    expect(() => Dispatch.readCompletionProof(saved, context, observer)).toThrow("foreign_completion_proof");
    await gateway.close();
  });
  it.each(["abort", "close"])("required %s revokes proof before unknown resolution and drains the late observer", async cause => {
    const ledger = memory(), context = Context.issue(owner), entered = deferred<void>(), gate = deferred<void>(), abort = new AbortController();
    let proof!: object;
    const observer = { completed: vi.fn(async (received: object) => { proof = received;
      entered.resolve();
      await gate.promise;
      expect(() => Dispatch.readCompletionProof(proof, context, observer)).toThrow("foreign_completion_proof"); }), uncertain: vi.fn(async () => undefined) };
    Outcome.require(context, observer);
    const close = vi.fn(async () => undefined), gateway = new ClientGatewayService({ commandTimeoutMs: 30, resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close }) }), sessionId = await paired(gateway, () => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context, signal: abort.signal });
    await tick();
    const receive = gateway.receive(sessionId, ack(response.commandId));
    await entered.promise;
    let closed = false;
    let closing: Promise<void> | undefined;
    if (cause === "abort") abort.abort();
    if (cause === "close") closing = gateway.close().then(() => { closed = true; });
    expect(await response.result).toEqual({ status: "outcome_unknown" });
    expect(observer.uncertain).toHaveBeenCalledTimes(1);
    expect(() => Dispatch.readCompletionProof(proof, context, observer)).toThrow("foreign_completion_proof");
    expect(close).not.toHaveBeenCalled();
    expect(closed).toBe(false);
    gate.resolve();
    await receive;
    await (closing ?? gateway.close());
    expect(close).toHaveBeenCalledTimes(1);
  });
  // t1028: the 11-24 sweep stopped a required run as Outcome uncertain on a
  // press that had answered: its event loop stalled, so the answer and the end
  // of its window came due together, and the window, still armed after the
  // answer was taken, revoked the proof while the observer ran. The window's
  // end is fired here by hand at that moment, as the stall made it happen.
  it("a required answer taken within its window completes even when the window ends while its observer runs", async () => {
    const ledger = memory(), context = Context.issue(owner), entered = deferred<void>(), gate = deferred<void>(), timers = scriptedTimers(), sends: number[] = [];
    const observer = { completed: vi.fn(async (proof: object) => { Dispatch.readCompletionProof(proof, context, observer);
      entered.resolve();
      await gate.promise;
      Dispatch.readCompletionProof(proof, context, observer); }), uncertain: vi.fn(async () => undefined) };
    Outcome.require(context, observer);
    const gateway = new ClientGatewayService({ startTimer: timers.source, resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close: async () => undefined }) });
    const sessionId = await paired(gateway, raw => { if (JSON.parse(raw).type === "server.execute_action") sends.push(1); });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action", timeoutMs: 200 }, { context });
    await tick();
    expect(timers.armed()).toBe(1);
    const receive = gateway.receive(sessionId, ack(response.commandId));
    await entered.promise;
    expect(timers.fireDue()).toBe(0);
    gate.resolve();
    await receive;
    expect(await response.result).toMatchObject({ status: "completed", result: { status: "succeeded" } });
    expect(observer.uncertain).not.toHaveBeenCalled();
    expect(ledger.markUnknown).not.toHaveBeenCalled();
    expect(sends).toHaveLength(1);
    await gateway.close();
  });
  it.each(["nobody to ask", "asked: unknown", "asked: unknown, then a late answer"] as const)("a required answer that never came within its window ends unknown (%s) and is never sent again", async variant => {
    const ledger = memory(), context = Context.issue(owner), timers = scriptedTimers(), sends: number[] = [];
    let asked = 0, sessionId = "";
    const observer = { completed: vi.fn(async () => undefined), uncertain: vi.fn(async () => undefined) };
    Outcome.require(context, observer);
    const gateway = new ClientGatewayService({ startTimer: timers.source, resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close: async () => undefined }) });
    sessionId = await paired(gateway, raw => { const message = JSON.parse(raw);
      if (message.type === "server.execute_action") sends.push(1);
      if (message.type === "server.reconcile_command") { asked += 1;
        setTimeout(() => void gateway.receive(sessionId, { id: `reconcile.${asked}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.reconcile_result", payload: { commandId: message.payload.commandId, state: "unknown" } }), 0); } }, "client.1", variant !== "nobody to ask");
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action", timeoutMs: 200 }, { context });
    await tick();
    expect(timers.fireDue()).toBe(1);
    expect(await response.result).toEqual({ status: "outcome_unknown" });
    expect(asked).toBe(variant === "nobody to ask" ? 0 : 1);
    if (variant === "asked: unknown, then a late answer") await gateway.receive(sessionId, ack(response.commandId));
    expect(observer.completed).not.toHaveBeenCalled();
    expect(observer.uncertain).toHaveBeenCalledTimes(1);
    expect(ledger.commitReceipt).not.toHaveBeenCalled();
    expect((await ledger.read(expect.anything()))?.state).toBe("unknown");
    expect(await gateway.executeAction(sessionId, { actionType: "synthetic.action", timeoutMs: 200 }, { context }).result).toEqual({ status: "outcome_unknown" });
    expect(sends).toHaveLength(1);
    await gateway.close();
  });
  it("failed observer or uncertainty notification cannot publish successful completion", async () => {
    const context = Context.issue(owner), observer = { completed: vi.fn(async () => { throw new Error("capture failed"); }), uncertain: vi.fn(async () => { throw new Error("stop notification failed"); }) };
    Outcome.require(context, observer);
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger: memory(), outcomeObserver: observer, close: async () => undefined }) }), sessionId = await paired(gateway, () => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context });
    const result = expect(response.result).rejects.toThrow("stop notification failed");
    await tick();
    await expect(gateway.receive(sessionId, ack(response.commandId))).rejects.toThrow("stop notification failed");
    await result;
    expect(observer.uncertain).toHaveBeenCalledTimes(1);
    await gateway.close();
  });
  it("required completion observer prevents public success until its post-COMMIT gate completes", async () => {
    const ledger = memory(), gate = deferred<void>(), entered = deferred<void>(), context = Context.issue(owner);
    const observer = { completed: vi.fn(async (_proof: object) => { expect((await ledger.read(expect.anything()))?.state).toBe("committed");
      entered.resolve();
      await gate.promise; }), uncertain: vi.fn(async () => undefined) };
    Outcome.require(context, observer);
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close: async () => undefined }) });
    const sessionId = await paired(gateway, () => undefined), response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context });
    let resolved = false;
    void response.result.then(() => { resolved = true; });
    await tick();
    const receive = gateway.receive(sessionId, ack(response.commandId));
    await tick();
    try { expect(observer.completed).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(false); } finally { gate.resolve();
      await receive;
      await gateway.close(); }
    expect(await response.result).toMatchObject({ status: "completed" });
  });
  it("registered required context cannot silently use a lease without its exact observer", async () => {
    const context = Context.issue(owner), observer = { completed: vi.fn(async () => undefined), uncertain: vi.fn(async () => undefined) }, sends: number[] = [];
    Outcome.require(context, observer);
    const gateway = new ClientGatewayService({ commandTimeoutMs: 10, resolveCommandLedger: async () => ({ ledger: memory(), close: async () => undefined }) });
    const sessionId = await paired(gateway, raw => { if (JSON.parse(raw).type === "server.execute_action") sends.push(1); });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context });
    try { await response.result.catch(() => undefined);
      expect(sends).toHaveLength(0);
      expect(observer.uncertain).toHaveBeenCalledTimes(1); } finally { await gateway.close(); }
  });
  it("delays all enqueue/send until claim and all public resolution/events until receipt commit", async () => {
    const ledger = memory(), claimGate = deferred<void>(), receiptGate = deferred<void>(), close = vi.fn(async () => undefined);
    const originalClaim = ledger.claim, originalReceipt = ledger.commitReceipt;
    ledger.claim = async claim => { await claimGate.promise;
      return originalClaim(claim); };
    ledger.commitReceipt = async (claim, receipt) => { await receiptGate.promise;
      return originalReceipt(claim, receipt); };
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close }) }), sends: unknown[] = [], events: unknown[] = [];
    const sessionId = await paired(gateway, raw => { const message = JSON.parse(raw);
      if (message.type === "server.execute_action") sends.push(message); });
    gateway.onEvent(event => { if (event.type === "client.action_result") events.push(event.message.payload); });
    const command = { actionType: "synthetic.action", parameters: { list: [1, 2] } };
    const response = gateway.executeAction(sessionId, command, { context: Context.issue(owner) });
    let resolved = false;
    void response.result.then(() => { resolved = true; });
    command.parameters.list.reverse();
    await tick();
    expect(sends).toHaveLength(0);
    expect(gateway.outbound(sessionId)).toHaveLength(0);
    claimGate.resolve();
    await tick();
    expect(sends).toHaveLength(1);
    expect(sends[0]).toMatchObject({ payload: { parameters: { list: [1, 2] } } });
    const receive = gateway.receive(sessionId, ack(response.commandId));
    await tick();
    expect(resolved).toBe(false);
    expect(events).toHaveLength(0);
    receiptGate.resolve();
    await receive;
    expect(await response.result).toMatchObject({ status: "completed", result: { status: "succeeded" } });
    expect(events).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(1);
    await gateway.close();
  });
  it("malformed supplied options/context never falls back; missing port and unready permission refuse before sends", async () => {
    const send = vi.fn(), gateway = new ClientGatewayService(), sessionId = await paired(gateway, send);
    send.mockClear();
    for (const options of [undefined, null, {}, { context: owner }, { context: Object.create(Context.prototype) }, { context: Context.issue(owner), signal: {} }]) expect(() => gateway.executeAction(sessionId, { actionType: "synthetic.action" }, options as never)).toThrow();
    await expect(gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }).result).rejects.toThrow("storage_unavailable");
    const unpaired = gateway.connect({ socket: { send } });
    expect(() => gateway.executeAction(unpaired.sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) })).toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(gateway.outbound(sessionId)).toHaveLength(0);
    await gateway.close();
  });
  it("wrong sender, malformed/nonfinite/provenance result and racing duplicates cannot reserve the right answer", async () => {
    const ledger = memory(), gate = deferred<void>(), original = ledger.commitReceipt;
    ledger.commitReceipt = vi.fn(async (claim, receipt) => { await gate.promise;
      return original(claim, receipt); });
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close: async () => undefined }) });
    const right = await paired(gateway, () => undefined), wrong = await paired(gateway, () => undefined, "client.wrong");
    const response = gateway.executeAction(right, { actionType: "synthetic.action" }, { context: Context.issue(owner) });
    await tick();
    await gateway.receive(wrong, ack(response.commandId));
    await gateway.receive(right, ack(response.commandId, { payload: { nonfinite: Number.NaN } }));
    await gateway.receive(right, ack(response.commandId, { status: "success" as never }));
    const forged = ack(response.commandId);
    Reflect.set(forged.payload, "receiptId", "model.success");
    await gateway.receive(right, forged);
    expect(ledger.commitReceipt).not.toHaveBeenCalled();
    const first = gateway.receive(right, ack(response.commandId)), duplicate = gateway.receive(right, ack(response.commandId, { payload: { wrong: true } }));
    await duplicate;
    await tick();
    gate.resolve();
    await first;
    expect(await response.result).toMatchObject({ status: "completed", result: { payload: { records: ["synthetic"] } } });
    await gateway.close();
  });
  it.each(["timeout", "abort", "disconnect", "wire_unknown", "send_throw"])("%s is uncertain and replay never resends", async cause => {
    const ledger = memory(), close = vi.fn(async () => undefined), sends: number[] = [];
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20, resolveCommandLedger: async () => ({ ledger, close }) });
    const sessionId = await paired(gateway, raw => { if (JSON.parse(raw).type === "server.execute_action") { sends.push(1);
      if (cause === "send_throw") throw new Error("effect then throw"); } });
    const abort = new AbortController(), context = Context.issue(owner), response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context, signal: abort.signal });
    await tick();
    if (cause === "abort") abort.abort();
    if (cause === "disconnect") gateway.disconnect(sessionId);
    if (cause === "wire_unknown") await gateway.receive(sessionId, ack(response.commandId, { status: "unknown" }));
    expect(await response.result).toEqual({ status: "outcome_unknown" });
    expect(sends).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(1);
    if (cause !== "disconnect") { expect(await gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context }).result).toEqual({ status: "outcome_unknown" });
      expect(sends).toHaveLength(1); }
    await gateway.close();
  });
  it("no socket cannot enqueue a durable command, while legacy context-free remains unchanged", async () => {
    const ledger = memory(), gateway = new ClientGatewayService({ commandTimeoutMs: 20, resolveCommandLedger: async () => ({ ledger, close: async () => undefined }) });
    const sessionId = await paired(gateway);
    expect(await gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }).result).toMatchObject({ status: "refused_unsent", refusal: { code: "socket_unavailable" } });
    expect(gateway.outbound(sessionId)).toHaveLength(0);
    expect(ledger.claim).not.toHaveBeenCalled();
    expect(ledger.markUnknown).not.toHaveBeenCalled();
    const legacy = gateway.executeAction(sessionId, { actionType: "synthetic.action" });
    await gateway.receive(sessionId, ack(legacy.commandId));
    expect((await legacy.result).status).toBe("succeeded");
    await gateway.close();
  });
  it("abort during a delayed claim gives zero sends and close awaits release without lease leaks", async () => {
    const ledger = memory(), gate = deferred<void>(), entered = deferred<void>(), close = vi.fn(async () => undefined), original = ledger.claim;
    ledger.claim = async claim => { entered.resolve();
      await gate.promise;
      return original(claim); };
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close }) }), send = vi.fn(), sessionId = await paired(gateway, send);
    send.mockClear();
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) });
    await entered.promise;
    let closed = false;
    const closing = gateway.close().then(() => { closed = true; });
    await tick();
    expect(closed).toBe(false);
    gate.resolve();
    expect(await response.result).toMatchObject({ status: "refused_unsent", refusal: { code: "cancelled_before_send" } });
    await closing;
    expect(ledger.markUnknown).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(() => gateway.executeAction(sessionId, { actionType: "synthetic.action" })).toThrow("closed");
  });
  it("receipt COMMIT lost acknowledgement and racing abort preserve committed result; cleanup error surfaces on close", async () => {
    const ledger = memory(), original = ledger.commitReceipt, abort = new AbortController();
    ledger.commitReceipt = async (claim, receipt) => { const saved = await original(claim, receipt);
      abort.abort();
      expect(saved.state).toBe("committed");
      throw new Error("lost commit ack"); };
    const lease: ClientGatewayCommandLedgerLease = { ledger, close: async () => { throw new Error("owned cleanup error"); } };
    const gateway = new ClientGatewayService({ resolveCommandLedger: async () => lease }), sessionId = await paired(gateway, () => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner), signal: abort.signal });
    await tick();
    await gateway.receive(sessionId, ack(response.commandId));
    expect(await response.result).toMatchObject({ status: "completed" });
    await expect(gateway.close()).rejects.toThrow("lease_cleanup_failed");
  });
  it("failing claim closes its lease with zero sends; failing receipt leaves unknown instead of publishing success", async () => {
    const ledger = memory(), close = vi.fn(async () => undefined), gateway = new ClientGatewayService({ resolveCommandLedger: async () => ({ ledger, close }) }), sends: number[] = [];
    const sessionId = await paired(gateway, raw => { if (JSON.parse(raw).type === "server.execute_action") sends.push(1); });
    const original = ledger.claim;
    ledger.claim = async () => { throw new Error("owned claim failure"); };
    await expect(gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) }).result).rejects.toThrow("owned claim failure");
    expect(sends).toHaveLength(0);
    expect(close).toHaveBeenCalledTimes(1);
    ledger.claim = original;
    ledger.commitReceipt = async () => { throw new Error("owned receipt failure"); };
    const events: unknown[] = [];
    gateway.onEvent(event => { if (event.type === "client.action_result") events.push(event); });
    const response = gateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: Context.issue(owner) });
    await tick();
    await gateway.receive(sessionId, ack(response.commandId));
    expect(await response.result).toEqual({ status: "outcome_unknown" });
    expect(events).toHaveLength(0);
    expect(close).toHaveBeenCalledTimes(2);
    await gateway.close();
  });
});
