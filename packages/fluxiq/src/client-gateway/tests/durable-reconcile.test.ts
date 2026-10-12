// A durable (required-mode) command whose answer never came is reconciled by
// command id before its ledger entry is called unknown (state-aware recovery
// plan, C8 and B3), exactly as an ordinary command is
// (`reconcile-by-command.test.ts`): a kept result is its answer, `not_seen` a
// failure that did nothing, and anything uncertain stays `outcome_unknown`
// with the ledger `unknown` and the required context told to stop.

import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  type ClientGatewayCapability,
  type ClientGatewayClientMessage,
  type ClientGatewayReconcileAnswer,
  type ClientGatewayServerMessage
} from "../index.ts";
import {
  ClientGatewayCommandContext as Context,
  ClientGatewayCommandLedgerController as Rules,
  ClientGatewayCommandOutcome as Outcome,
  type ClientGatewayCommandLedgerPort,
  type ClientGatewayCommandRecord
} from "../service/command-ledger/index.ts";

const ANSWERS: ClientGatewayCapability = { id: "example.reconcile", kind: "action", metadata: { answersReconcile: true } };
const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "node.attempt.1", effectOrdinal: 0 };
const pressed = { status: "succeeded" as const, message: "pressed", payload: { pressed: true } };
const AMBIGUOUS = { category: "ambiguous_or_unknown" as const, code: "example.action.unknown", retryable: false, stage: "execution" as const, effect: "ambiguous" as const };
const UNACTED = { category: "action_failed" as const, code: "example.transport.transient", retryable: true, stage: "execution" as const, effect: "unacted" as const };

type Responder = (commandId: string) => Omit<ClientGatewayReconcileAnswer, "commandId"> | undefined;

describe("a durable command whose answer never came", () => {
  it("landed: is completed from the kept result, its receipt committed, and is never sent again", async () => {
    const run = await durable((commandId) => ({ state: "landed", result: { commandId, ...pressed } }));

    const outcome = await run.response.result;

    expect(outcome).toMatchObject({ status: "completed", result: { status: "succeeded", payload: { pressed: true }, metadata: { reconciled: "landed" } }, receipt: { status: "succeeded" } });
    expect(run.ledger.saved()?.state).toBe("committed");
    expect(run.observer.completed).toHaveBeenCalledTimes(1);
    expect(run.observer.uncertain).not.toHaveBeenCalled();
    expect(sends(run.sent)).toBe(1);
    expect(run.gateway.snapshot().auditLog.find((entry) => entry.type === "command.reconciled")?.metadata).toMatchObject({ commandId: run.response.commandId, state: "landed", durable: true });
    await run.gateway.close();
  });

  it("not_seen: is completed as a failure that did nothing, so a new attempt may follow", async () => {
    const run = await durable(() => ({ state: "not_seen" }));

    const outcome = await run.response.result;

    expect(outcome).toMatchObject({
      status: "completed",
      result: { status: "failed", failure: { code: "client_gateway.command_not_seen", retryable: true, effect: "unacted" }, payload: { status: "not_seen" } },
      receipt: { status: "failed", failureClass: "action_failed" }
    });
    expect(run.ledger.saved()?.state).toBe("committed");
    expect(run.observer.uncertain).not.toHaveBeenCalled();
    expect(sends(run.sent)).toBe(1);
    await run.gateway.close();
  });

  it("unknown: stays outcome_unknown, the ledger unknown and the required context stopped", async () => {
    const run = await durable(() => ({ state: "unknown" }));

    await expect(run.response.result).resolves.toEqual({ status: "outcome_unknown" });
    expect(run.ledger.saved()).toMatchObject({ state: "unknown", receipt: null });
    expect(run.observer.uncertain).toHaveBeenCalledTimes(1);
    expect(run.observer.completed).not.toHaveBeenCalled();
    expect(sends(run.sent)).toBe(1);
    await run.gateway.close();
  });

  it("a kept result that is itself an interrupted lasting act stays outcome_unknown", async () => {
    const run = await durable((commandId) => ({ state: "landed", result: { commandId, status: "interrupted", payload: { status: "interrupted" }, failure: AMBIGUOUS } }));

    await expect(run.response.result).resolves.toEqual({ status: "outcome_unknown" });
    expect(run.ledger.saved()?.state).toBe("unknown");
    expect(run.observer.uncertain).toHaveBeenCalledTimes(1);
    await run.gateway.close();
  });

  it("the client's own answer, arriving while it is being asked, wins", async () => {
    let run!: Awaited<ReturnType<typeof durable>>;
    run = await durable((commandId) => {
      void run.gateway.receive(run.sessionId, message("client.action_result", { commandId, status: "failed", message: "its own answer" }));
      return undefined;
    });

    await expect(run.response.result).resolves.toMatchObject({ status: "completed", result: { status: "failed", message: "its own answer" } });
    expect(run.observer.uncertain).not.toHaveBeenCalled();
    await run.gateway.close();
  });

  it("a dropped session of a client that answers waits for it to come back and asks it there", async () => {
    const run = await durable(() => undefined, 60);
    await waitFor(() => sends(run.sent) === 1);
    run.gateway.disconnect(run.sessionId, "worker restarted");
    const kept = { status: "interrupted" as const, payload: { status: "interrupted" }, failure: UNACTED };
    const reconnected = await pairClient(run.gateway, "extension.1", [ANSWERS], (commandId) => ({ state: "landed", result: { commandId, ...kept } }));

    const outcome = await run.response.result;

    expect(outcome).toMatchObject({ status: "completed", result: { status: "failed", failure: { effect: "unacted" } }, receipt: { sessionId: run.sessionId } });
    expect(run.gateway.outbound(reconnected).map((item) => item.type)).toContain("server.reconcile_command");
    expect(sends(run.sent)).toBe(1);
    await run.gateway.close();
  });

  it("a dropped session of a client that never said it answers is unknown at once, as before", async () => {
    const run = await durable(() => ({ state: "not_seen" }), 60_000, []);
    await waitFor(() => sends(run.sent) === 1);
    run.gateway.disconnect(run.sessionId, "socket closed");

    await expect(run.response.result).resolves.toEqual({ status: "outcome_unknown" });
    expect(run.ledger.saved()?.state).toBe("unknown");
    expect(run.sent.map((item) => item.type)).toEqual(["server.execute_action"]);
    await run.gateway.close();
  });
});

async function durable(responder: Responder, commandTimeoutMs = 20, capabilities: ClientGatewayCapability[] = [ANSWERS]) {
  const ledger = memory();
  const context = Context.issue(owner);
  const observer = { completed: vi.fn(async () => undefined), uncertain: vi.fn(async () => undefined) };
  Outcome.require(context, observer);
  const gateway = new ClientGatewayService({ commandTimeoutMs, reconcileAnswerMs: 30, resolveCommandLedger: async () => ({ ledger: ledger.port, outcomeObserver: observer, close: async () => undefined }) });
  const sent: ClientGatewayServerMessage[] = [];
  const sessionId = await pairClient(gateway, "extension.1", capabilities, responder, sent);
  const response = gateway.executeAction(sessionId, { actionType: "example.press" }, { context });
  return { gateway, sessionId, sent, ledger, observer, response };
}

function memory(): { port: ClientGatewayCommandLedgerPort; saved(): ClientGatewayCommandRecord | null } {
  let saved: ClientGatewayCommandRecord | null = null;
  const port: ClientGatewayCommandLedgerPort = {
    claim: async (claim) => {
      const sendAllowed = saved === null;
      saved ??= { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending", receipt: null, committedAt: null, unknownReason: null };
      Rules.validateRecord(claim, saved);
      return { sendAllowed, record: saved };
    },
    commitReceipt: async (claim, receipt) => {
      if (!saved) throw new Error("missing");
      saved = { ...saved, claim, state: "committed", receipt, committedAt: Date.now(), unknownReason: null };
      return saved;
    },
    markUnknown: async (_claim, reason) => {
      if (!saved) throw new Error("missing");
      if (saved.state !== "committed") saved = { ...saved, state: "unknown", unknownReason: reason };
      return saved;
    },
    read: async () => saved
  };
  return { port, saved: () => saved };
}

/** A paired client whose socket answers each reconcile question with `responder`. */
async function pairClient(gateway: ClientGatewayService, clientId: string, capabilities: ClientGatewayCapability[], responder: Responder, sent: ClientGatewayServerMessage[] = []): Promise<string> {
  let sessionId = "";
  const socket = {
    send: (raw: string) => {
      const outgoing = JSON.parse(raw) as ClientGatewayServerMessage;
      if (outgoing.type !== "server.reconcile_command" && outgoing.type !== "server.execute_action") return;
      sent.push(outgoing);
      if (outgoing.type !== "server.reconcile_command") return;
      const commandId = outgoing.payload.commandId;
      const answer = responder(commandId);
      if (answer) setTimeout(() => void gateway.receive(sessionId, message("client.reconcile_result", { commandId, ...answer })), 1);
    }
  };
  const session = gateway.connect({ socket });
  sessionId = session.sessionId;
  await gateway.receive(sessionId, message("client.hello", { clientId, clientType: "extension", name: clientId, capabilities }));
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === sessionId);
  if (pairing) await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.reconcile" });
  gateway.clearOutbound(sessionId);
  return sessionId;
}

function sends(messages: readonly ClientGatewayServerMessage[]): number {
  return messages.filter((item) => item.type === "server.execute_action").length;
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !condition(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 1));
}

function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `${type}.${Math.random()}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type, payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}
