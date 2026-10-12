// A result for a command Core no longer awaits (browser contract B3, C8): the
// command timed out, was marked uncertain, was closed, or was already settled.
// It is recorded as late for the run's evidence, never applied as a fresh
// outcome, and never resolves another waiter.

import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewayLateActionResult, type ClientGatewayReportedActionResult } from "../index.ts";
import { ClientGatewayCommandContext, ClientGatewayCommandLedgerController, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../service/index.ts";

const ambiguous = { category: "ambiguous_or_unknown", code: "web.action.unknown", retryable: false, effect: "ambiguous" } as const;
const unacted = { category: "action_failed", code: "web.transport.transient", retryable: true, effect: "unacted" } as const;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("a result for a command Core no longer awaits", () => {
  it("after its command timed out, is recorded as late for the run that sent it, and resolves nothing", async () => {
    let runId = "run.1";
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20, commandOwner: () => ({ projectId: "project.1", runId }) });
    const sessionId = await pair(gateway, "extension.1");
    const lates = listen(gateway);
    const timedOut = gateway.executeAction(sessionId, { actionType: "example.press" });
    await expect(timedOut.result).resolves.toMatchObject({ status: "timed_out" });
    runId = "run.2";
    const waiting = gateway.executeAction(sessionId, { actionType: "example.press", timeoutMs: 1_000 });
    const tracked = settledValue(waiting.result);

    await gateway.receive(sessionId, actionResult({ commandId: timedOut.commandId, status: "interrupted", failure: ambiguous, message: "The browser lost it.", payload: { status: "interrupted", effect: "unknown", actionType: "example.press" } }));

    expect(lates).toEqual([{
      commandId: timedOut.commandId,
      actionType: "example.press",
      owner: { projectId: "project.1", runId: "run.1" },
      durable: false,
      closedAs: "timed_out",
      dispatchedAt: expect.any(Number),
      closedAt: expect.any(Number),
      receivedAt: expect.any(Number),
      status: "unknown",
      reportedStatus: "interrupted",
      interrupted: true,
      effect: "ambiguous",
      failureCode: "web.action.unknown",
      sameSession: true
    }]);
    await expect(timedOut.result).resolves.toMatchObject({ status: "timed_out" });
    await sleep(0);
    expect(tracked.value, "a late answer never resolves another command's wait").toBeUndefined();
    await gateway.receive(sessionId, actionResult({ commandId: waiting.commandId, status: "succeeded" }));
    await expect(waiting.result).resolves.toMatchObject({ status: "succeeded" });
    expect(lates).toHaveLength(1);
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "command.late_result")).toBe(true);
    await gateway.close();
  });

  it("repeating a settled command's answer is late, and the caller keeps the outcome it was given", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000 });
    const sessionId = await pair(gateway, "extension.repeat");
    const lates = listen(gateway);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });
    await gateway.receive(sessionId, actionResult({ commandId: response.commandId, status: "succeeded", message: "pressed" }));
    await gateway.receive(sessionId, actionResult({ commandId: response.commandId, status: "unknown", failure: ambiguous, payload: { status: "interrupted", effect: "unknown" } }));

    await expect(response.result).resolves.toMatchObject({ status: "succeeded", message: "pressed" });
    expect(lates).toEqual([expect.objectContaining({ commandId: response.commandId, closedAs: "settled", status: "unknown", reportedStatus: "unknown", interrupted: true })]);
    expect(lates[0]).not.toHaveProperty("owner");
    await gateway.close();
  });

  it("from another client, is not the run's evidence", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20 });
    const owner = await pair(gateway, "extension.owner");
    const other = await pair(gateway, "extension.other");
    const lates = listen(gateway);
    const response = gateway.executeAction(owner, { actionType: "example.press" });
    await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
    await gateway.receive(other, actionResult({ commandId: response.commandId, status: "succeeded" }));
    expect(lates).toEqual([]);
    await gateway.close();
  });

  it("from the same client on the session it reconnected on, counts", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20 });
    const first = await pair(gateway, "extension.reconnects");
    const lates = listen(gateway);
    const response = gateway.executeAction(first, { actionType: "example.press" });
    await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
    const second = await pair(gateway, "extension.reconnects");
    await gateway.receive(second, actionResult({ commandId: response.commandId, status: "interrupted", failure: unacted }));
    expect(lates).toEqual([expect.objectContaining({ commandId: response.commandId, status: "failed", reportedStatus: "interrupted", effect: "unacted", sameSession: false })]);
    await gateway.close();
  });

  it("after the gateway closed its commands, is late as closed", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000 });
    const sessionId = await pair(gateway, "extension.closing");
    const lates = listen(gateway);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });
    await gateway.close();
    await gateway.receive(sessionId, actionResult({ commandId: response.commandId, status: "succeeded" }));
    await expect(response.result).resolves.toMatchObject({ status: "unknown" });
    expect(lates).toEqual([expect.objectContaining({ closedAs: "closed", status: "succeeded" })]);
  });

  it("a listener that fails does not stop the others, and is noted in the audit log", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20 });
    const sessionId = await pair(gateway, "extension.listener");
    gateway.onLateActionResult(() => { throw new Error("could not record"); });
    const lates = listen(gateway);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });
    await expect(response.result).resolves.toMatchObject({ status: "timed_out" });
    await gateway.receive(sessionId, actionResult({ commandId: response.commandId, status: "succeeded" }));
    expect(lates).toHaveLength(1);
    expect(gateway.snapshot().auditLog.some((entry) => entry.type === "command.late_result_unrecorded")).toBe(true);
    await gateway.close();
  });
});

describe("a client's `interrupted` on a command Core awaits", () => {
  it("settles a waiting command as the domain says: a committing act uncertain, any other a failure that did nothing", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000 });
    const sessionId = await pair(gateway, "extension.interrupted");
    const committing = gateway.executeAction(sessionId, { actionType: "example.press" });
    const other = gateway.executeAction(sessionId, { actionType: "example.type" });
    const events: string[] = [];
    gateway.onEvent((event) => { if (event.type === "client.action_result") events.push(event.message.payload.status); });
    await gateway.receive(sessionId, actionResult({ commandId: committing.commandId, status: "interrupted", failure: ambiguous }));
    await gateway.receive(sessionId, actionResult({ commandId: other.commandId, status: "interrupted", failure: unacted }));
    await expect(committing.result).resolves.toMatchObject({ status: "unknown", failure: ambiguous });
    await expect(other.result).resolves.toMatchObject({ status: "failed", failure: unacted });
    expect(events, "no listener meets `interrupted`").toEqual(["unknown", "failed"]);
    await gateway.close();
  });

  it("on a durable command, a committing act is held uncertain with its ledger record unknown, and any other act is a committed failure", async () => {
    const ledger = memoryLedger();
    // A long wait, so only the interrupted answer can end these commands within the test's time.
    const gateway = new ClientGatewayService({ commandTimeoutMs: 60_000, resolveCommandLedger: async () => ({ ledger, close: async () => undefined }) });
    const sessionId = await pair(gateway, "extension.durable");
    const lates = listen(gateway);
    const committing = gateway.executeAction(sessionId, { actionType: "example.press" }, { context: ClientGatewayCommandContext.issue(durableOwner("attempt.1")) });
    const other = gateway.executeAction(sessionId, { actionType: "example.type" }, { context: ClientGatewayCommandContext.issue(durableOwner("attempt.2")) });
    await sleep(0);
    await gateway.receive(sessionId, actionResult({ commandId: committing.commandId, status: "interrupted", failure: ambiguous }));
    await gateway.receive(sessionId, actionResult({ commandId: other.commandId, status: "interrupted", failure: unacted }));
    await expect(committing.result).resolves.toEqual({ status: "outcome_unknown" });
    expect(ledger.saved(committing.commandId)?.state).toBe("unknown");
    await expect(other.result).resolves.toMatchObject({ status: "completed", result: { status: "failed", failure: unacted }, receipt: { status: "failed", failureClass: "action_failed" } });
    expect(lates, "both answered commands Core awaited, so neither is late").toEqual([]);
    await gateway.close();
  });

  it("on a durable command marked uncertain, a later answer is late for the run that owns it and is never committed", async () => {
    const ledger = memoryLedger();
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20, resolveCommandLedger: async () => ({ ledger, close: async () => undefined }) });
    const sessionId = await pair(gateway, "extension.durable-late");
    const lates = listen(gateway);
    const timedOut = gateway.executeAction(sessionId, { actionType: "example.press" }, { context: ClientGatewayCommandContext.issue(durableOwner("attempt.1")) });
    await expect(timedOut.result).resolves.toEqual({ status: "outcome_unknown" });
    await gateway.receive(sessionId, actionResult({ commandId: timedOut.commandId, status: "succeeded" }));
    expect(ledger.saved(timedOut.commandId)?.state, "a late success is never committed as the outcome").toBe("unknown");
    expect(lates).toEqual([
      expect.objectContaining({ commandId: timedOut.commandId, durable: true, closedAs: "uncertain", status: "succeeded", owner: { projectId: "project.durable", runId: "run.durable" } })
    ]);
    await gateway.close();
  });
});

function durableOwner(attemptId: string) {
  return { projectId: "project.durable", runId: "run.durable", flowId: "flow.1", invocationId: "invoke.1", attemptId, effectOrdinal: 0 };
}

function listen(gateway: ClientGatewayService): ClientGatewayLateActionResult[] {
  const lates: ClientGatewayLateActionResult[] = [];
  gateway.onLateActionResult((late) => { lates.push(late); });
  return lates;
}

async function pair(gateway: ClientGatewayService, clientId: string): Promise<string> {
  // A socket, so a durable command's send is delivered rather than refused as unsendable.
  const session = gateway.connect({ socket: { send: () => undefined } });
  await gateway.receive(session.sessionId, message("client.hello", { clientId, clientType: "extension", name: clientId }));
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId);
  if (pairing) await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.late" });
  gateway.clearOutbound(session.sessionId);
  return session.sessionId;
}

function actionResult(payload: ClientGatewayReportedActionResult): ClientGatewayClientMessage {
  return message("client.action_result", payload);
}

function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

function settledValue<T>(promise: Promise<T>): { value: T | undefined } {
  const tracked: { value: T | undefined } = { value: undefined };
  void promise.then((value) => { tracked.value = value; });
  return tracked;
}

function memoryLedger(): ClientGatewayCommandLedgerPort & { saved(commandId: string): ClientGatewayCommandRecord | undefined } {
  const records = new Map<string, ClientGatewayCommandRecord>();
  const key = (claim: { binding: { commandId: string } }) => claim.binding.commandId;
  return {
    saved: (commandId) => records.get(commandId),
    claim: vi.fn(async (claim) => {
      const existing = records.get(key(claim));
      const record = existing ?? { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending" as const, receipt: null, committedAt: null, unknownReason: null };
      records.set(key(claim), record);
      ClientGatewayCommandLedgerController.validateRecord(claim, record);
      return { sendAllowed: !existing, record };
    }),
    commitReceipt: vi.fn(async (claim, receipt) => {
      const record = { ...records.get(key(claim))!, state: "committed" as const, receipt, committedAt: Date.now(), unknownReason: null };
      records.set(key(claim), record);
      return record;
    }),
    markUnknown: vi.fn(async (claim, reason) => {
      const current = records.get(key(claim))!;
      const record = current.state === "committed" ? current : { ...current, state: "unknown" as const, unknownReason: reason };
      records.set(key(claim), record);
      return record;
    }),
    read: vi.fn(async (claim) => records.get(key(claim)) ?? null)
  };
}
