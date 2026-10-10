// A command whose answer never came is reconciled by command id before Core
// calls it timed out (state-aware recovery plan, C8 and B3): Core asks the
// client that was sent it what became of it, the client answers from what it
// kept, and nothing is ever sent to be done a second time.

import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  type ClientGatewayCapability,
  type ClientGatewayClientMessage,
  type ClientGatewayReconcileAnswer,
  type ClientGatewayServerMessage
} from "../index.ts";

const ANSWERS: ClientGatewayCapability = { id: "example.reconcile", kind: "action", metadata: { answersReconcile: true } };
const pressed = { status: "succeeded" as const, message: "pressed", payload: { pressed: true } };

type Responder = (commandId: string, asked: number) => Omit<ClientGatewayReconcileAnswer, "commandId"> | undefined;

describe("a command whose answer never came", () => {
  it("landed: is settled with the result the client kept, and is never sent again", async () => {
    const { gateway, sessionId, sent } = await harness((commandId) => ({ state: "landed", result: { commandId, ...pressed } }));
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    const result = await response.result;

    expect(result).toMatchObject({ commandId: response.commandId, status: "succeeded", message: "pressed", payload: { pressed: true }, metadata: { reconciled: "landed" } });
    expect(types(sent)).toEqual(["server.execute_action", "server.reconcile_command"]);
    expect(gateway.snapshot().auditLog.find((entry) => entry.type === "command.reconciled")?.metadata).toMatchObject({ commandId: response.commandId, state: "landed", status: "succeeded" });
    await gateway.close();
  });

  it("not_seen: is a failure that did nothing, so the caller's ordinary retry follows", async () => {
    const { gateway, sessionId, sent } = await harness(() => ({ state: "not_seen" }));
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    const result = await response.result;

    expect(result).toMatchObject({
      commandId: response.commandId,
      status: "failed",
      failure: { category: "timeout", code: "client_gateway.command_not_seen", retryable: true, stage: "dispatch", effect: "unacted" },
      payload: { status: "not_seen" },
      metadata: { reconciled: "not_seen" }
    });
    expect(types(sent).filter((type) => type === "server.execute_action")).toHaveLength(1);
    await gateway.close();
  });

  it("running: is waited on once and asked again, and settles from the second answer", async () => {
    const { gateway, sessionId, sent } = await harness((commandId, asked) => asked === 1 ? { state: "running" } : { state: "landed", result: { commandId, ...pressed } });
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    await expect(response.result).resolves.toMatchObject({ status: "succeeded", metadata: { reconciled: "landed" } });
    expect(types(sent)).toEqual(["server.execute_action", "server.reconcile_command", "server.reconcile_command"]);
    await gateway.close();
  });

  it("running twice: stays timed out, so the caller's effect check decides and nothing is pressed again", async () => {
    const { gateway, sessionId, sent } = await harness(() => ({ state: "running" }));
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    await expect(response.result).resolves.toMatchObject({ status: "timed_out", metadata: { reconciled: "running" } });
    expect(types(sent)).toEqual(["server.execute_action", "server.reconcile_command", "server.reconcile_command"]);
    await gateway.close();
  });

  it("unknown: stays timed out", async () => {
    const { gateway, sessionId, sent } = await harness(() => ({ state: "unknown" }));
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    await expect(response.result).resolves.toEqual({ commandId: response.commandId, status: "timed_out", message: "Client action timed out after 20ms.", metadata: { reconciled: "unknown" } });
    expect(types(sent).filter((type) => type === "server.execute_action")).toHaveLength(1);
    await gateway.close();
  });

  it("a client that never answers the question is unknown once the answer window passes", async () => {
    const { gateway, sessionId } = await harness(() => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    await expect(response.result).resolves.toMatchObject({ status: "timed_out", metadata: { reconciled: "unknown" } });
    await gateway.close();
  });

  it("a session that never declared it answers is not asked, and keeps today's timed_out", async () => {
    const { gateway, sessionId, sent } = await harness(() => ({ state: "not_seen" }), []);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    await expect(response.result).resolves.toEqual({ commandId: response.commandId, status: "timed_out", message: "Client action timed out after 20ms." });
    expect(types(sent)).toEqual(["server.execute_action"]);
    expect(await gateway.reconcileAction(response.commandId)).toBeUndefined();
    await gateway.close();
  });

  it("the command's own answer, arriving while the client is being asked, wins", async () => {
    let gateway!: ClientGatewayService;
    let sessionId = "";
    const fixture = await harness((commandId) => {
      void gateway.receive(sessionId, message("client.action_result", { commandId, status: "failed", message: "its own answer" }));
      return undefined;
    });
    gateway = fixture.gateway;
    sessionId = fixture.sessionId;
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    await expect(response.result).resolves.toEqual({ commandId: response.commandId, status: "failed", message: "its own answer" });
    await gateway.close();
  });

  it("an answer from another client, or about a command nobody asked about, settles nothing", async () => {
    const { gateway, sessionId } = await harness(() => undefined);
    const stranger = await pairClient(gateway, "extension.stranger", [ANSWERS], () => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });
    await waitFor(() => gateway.outbound(sessionId).some((item) => item.type === "server.reconcile_command"));

    await gateway.receive(stranger, message("client.reconcile_result", { commandId: response.commandId, state: "landed", result: { commandId: response.commandId, ...pressed } }));
    await gateway.receive(sessionId, message("client.reconcile_result", { commandId: "command.nobody-asked", state: "not_seen" }));

    await expect(response.result).resolves.toMatchObject({ status: "timed_out", metadata: { reconciled: "unknown" } });
    expect(gateway.snapshot().auditLog.filter((entry) => entry.type === "command.reconcile_unasked")).toHaveLength(2);
    await gateway.close();
  });

  it("a landed answer without the kept result for this command is read as unknown", async () => {
    const { gateway, sessionId } = await harness(() => ({ state: "landed", result: { commandId: "command.other", ...pressed } }));
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });

    await expect(response.result).resolves.toMatchObject({ status: "timed_out", metadata: { reconciled: "unknown" } });
    await gateway.close();
  });

  it("asks the session its client reconnected on when the command's own session is gone", async () => {
    const { gateway, sessionId } = await harness(() => undefined);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });
    gateway.disconnect(sessionId, "socket closed");
    const reconnected = await pairClient(gateway, "extension.1", [ANSWERS], (commandId) => ({ state: "landed", result: { commandId, ...pressed } }));

    await expect(response.result).resolves.toMatchObject({ status: "succeeded", metadata: { reconciled: "landed" } });
    expect(types(gateway.outbound(reconnected))).toContain("server.reconcile_command");
    await gateway.close();
  });

  it("reconcileAction asks by command id and answers without anything being executed", async () => {
    const { gateway, sessionId, sent } = await harness(() => ({ state: "running" }), [ANSWERS], 10_000);
    const response = gateway.executeAction(sessionId, { actionType: "example.press" });
    const answers: Responder = (commandId) => ({ state: "landed", result: { commandId, ...pressed } });
    respondWith = answers;

    await expect(gateway.reconcileAction(response.commandId)).resolves.toMatchObject({ commandId: response.commandId, state: "landed", result: { status: "succeeded" } });
    expect(await gateway.reconcileAction("command.never-sent")).toBeUndefined();
    expect(types(sent).filter((type) => type === "server.execute_action")).toHaveLength(1);
    await gateway.close();
  });
});

let respondWith: Responder | undefined;

async function harness(responder: Responder, capabilities: ClientGatewayCapability[] = [ANSWERS], commandTimeoutMs = 20): Promise<{ gateway: ClientGatewayService; sessionId: string; sent: ClientGatewayServerMessage[] }> {
  respondWith = undefined;
  const gateway = new ClientGatewayService({ commandTimeoutMs, reconcileAnswerMs: 30 });
  const sent: ClientGatewayServerMessage[] = [];
  const sessionId = await pairClient(gateway, "extension.1", capabilities, responder, sent);
  return { gateway, sessionId, sent };
}

/** A paired client whose socket answers each reconcile question with `responder`, or with the test's override once set. */
async function pairClient(gateway: ClientGatewayService, clientId: string, capabilities: ClientGatewayCapability[], responder: Responder, sent: ClientGatewayServerMessage[] = []): Promise<string> {
  let sessionId = "";
  let asked = 0;
  const socket = {
    send: (raw: string) => {
      const outgoing = JSON.parse(raw) as ClientGatewayServerMessage;
      if (outgoing.type !== "server.reconcile_command" && outgoing.type !== "server.execute_action") return;
      sent.push(outgoing);
      if (outgoing.type !== "server.reconcile_command") return;
      asked += 1;
      const commandId = outgoing.payload.commandId;
      const answer = (respondWith ?? responder)(commandId, asked);
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

function types(messages: readonly ClientGatewayServerMessage[]): string[] {
  return messages.map((item) => item.type);
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !condition(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 1));
}

function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}
