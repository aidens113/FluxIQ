import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewaySession } from "../../client-gateway/index.ts";
import { RuntimeService, ClientGatewayRuntimeTransport } from "../index.ts";
import { ClientGatewayCommandContext, ClientGatewayCommandLedgerController, ClientGatewayCommandOutcome, type ClientGatewayCommandRecord } from "../../client-gateway/service/command-ledger/index.ts";

describe("ClientGatewayRuntimeTransport", () => {
  it("lifts a measured payload fact from ordinary and completed durable results without changing the wire result", async () => {
    for (const durable of [false, true]) {
      let record: ClientGatewayCommandRecord | null = null;
      const observer = { completed: async (_proof: object) => undefined, uncertain: async () => undefined };
      const gateway = new ClientGatewayService({ commandTimeoutMs: 1000, resolveCommandLedger: async () => ({
        outcomeObserver: observer, close: async () => undefined,
        ledger: {
          claim: async (claim) => {
            record = { claim, claimedAt: Date.now(), state: "pending", unknownReason: null, receipt: null, committedAt: null };
            return { sendAllowed: true, record: structuredClone(record) };
          },
          commitReceipt: async (_claim, receipt) => {
            record = { ...record!, receipt, state: "committed", committedAt: Date.now() };
            return structuredClone(record);
          },
          markUnknown: async (_claim, reason) => {
            record = { ...record!, state: "unknown", unknownReason: reason };
            return structuredClone(record);
          },
          read: async () => record && structuredClone(record)
        }
      }) });
      const paired = await pairGatewayClient(gateway, `extension.control.${durable}`, "user.web", { socket: durable });
      const transport = new ClientGatewayRuntimeTransport({ gateway });
      const context = ClientGatewayCommandContext.issue({ projectId: "project.control", runId: "run.control", flowId: "flow.control", invocationId: "invoke.control", attemptId: "attempt.control", effectOrdinal: 0 });
      ClientGatewayCommandOutcome.require(context, observer);
      const pending = transport.dispatch({ kind: "execute_action", actionType: "web.dom.click" }, durable ? { commandContext: context } : {});
      let commandId = "";
      for (let turn = 0; turn < 50 && !commandId; turn += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        commandId = lastExecuteCommandId(gateway, paired.sessionId);
      }
      expect(commandId).not.toBe("");
      const raw = { commandId, status: "failed" as const, failure: { category: "action_failed" as const, code: "client.declined", retryable: false }, payload: { actionability: { actionable: false, cause: "covered" }, actual: "retained" } };
      const before = JSON.stringify(raw);
      await gateway.receive(paired.sessionId, clientMessage("client.action_result", raw));
      const result = await pending;
      expect(result).toMatchObject({ status: "failed", failure: raw.failure, payload: raw.payload, actionability: { actionable: false, cause: "covered" } });
      expect(JSON.stringify(raw)).toBe(before);
      expect(raw).not.toHaveProperty("actionability");
      if (durable) expect(record).toMatchObject({ state: "committed", receipt: { redaction: "receipt_only", status: "failed", resultDigest: ClientGatewayCommandLedgerController.digest(raw) } });
      await gateway.close();
    }
  });

  it("projects paired gateway sessions as runtime clients", async () => {
    const gateway = new ClientGatewayService();
    await pairGatewayClient(gateway, "extension.web", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });

    expect(transport.clients()).toMatchObject([{
      clientId: "extension.web",
      transport: "websocket",
      status: "ready",
      domainId: "web-automation",
      capabilities: [{ id: "web.actions", kind: "action", actionTypes: ["web.dom.click"] }]
    }]);
  });

  it("dispatches runtime action commands to matching paired sessions", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const paired = await pairGatewayClient(gateway, "extension.dispatch", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });

    const resultPromise = transport.dispatch({
      kind: "execute_action",
      domainId: "web-automation",
      actionType: "web.dom.click",
      parameters: { selector: "#save" }
    });
    const executeMessage = gateway.outbound(paired.sessionId).find((message) => message.type === "server.execute_action");
    expect(executeMessage).toMatchObject({ type: "server.execute_action", payload: { actionType: "web.dom.click" } });

    await gateway.receive(paired.sessionId, clientMessage("client.action_result", {
      commandId: executeMessage?.type === "server.execute_action" ? executeMessage.payload.commandId : "",
      status: "succeeded",
      message: "clicked"
    }));

    await expect(resultPromise).resolves.toMatchObject({ status: "succeeded", message: "clicked" });
  });

  // t434: Automation Studio addresses a policy output by `outputId`, and a gateway
  // client can only name what it serves as action types, often with the domain
  // on the capability alone. The runtime and the transport both took that
  // client for no match, so a run on Core's own transport never sent a command.
  it("routes an output-addressed command to a client that names the output as an action type and the domain on its capability", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const paired = await pairGatewayClient(gateway, "extension.capability-domain", "user.web", { sessionDomain: false });
    const runtime = new RuntimeService();
    runtime.registerTransport(new ClientGatewayRuntimeTransport({ gateway }));

    const resultPromise = runtime.dispatch({ kind: "execute_action", domainId: "web-automation", outputId: "web.dom.click", actionType: "web.dom.click", parameters: { selector: "#save" } });
    let executeMessage: ReturnType<ClientGatewayService["outbound"]>[number] | undefined;
    for (let turn = 0; turn < 50 && !executeMessage; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      executeMessage = gateway.outbound(paired.sessionId).find((message) => message.type === "server.execute_action");
    }
    expect(executeMessage).toMatchObject({ type: "server.execute_action", payload: { actionType: "web.dom.click" } });
    await gateway.receive(paired.sessionId, clientMessage("client.action_result", {
      commandId: executeMessage?.type === "server.execute_action" ? executeMessage.payload.commandId : "",
      status: "succeeded",
      message: "clicked"
    }));
    await expect(resultPromise).resolves.toMatchObject({ status: "succeeded", message: "clicked" });
  });

  // t707 C3: the browser reconnects with the same clientId, so one clientId can
  // have several sessions. Commands went to the first `ready` one in the list,
  // an older session, and the build waited forever on its answer.
  it("sends a client's commands to its newest live session", async () => {
    let clock = 1_000;
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000, now: () => clock });
    const older = await pairGatewayClient(gateway, "extension.twice", "user.web");
    clock += 10;
    const newer = await pairGatewayClient(gateway, "extension.twice", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });

    const dispatched = transport.dispatch({ kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" }, { preferredClientId: "extension.twice" });
    expect(lastExecuteCommandId(gateway, older.sessionId)).toBe("");
    const commandId = lastExecuteCommandId(gateway, newer.sessionId);
    expect(commandId).not.toBe("");
    await gateway.receive(newer.sessionId, clientMessage("client.action_result", { commandId, status: "succeeded", message: "clicked" }));
    await expect(dispatched).resolves.toMatchObject({ status: "succeeded" });
    await gateway.close();
  });

  it("never selects a ready session whose socket has gone", async () => {
    const live = gatewaySession({ sessionId: "session.live", connectedAt: 1_000 });
    const orphan = gatewaySession({ sessionId: "session.orphan", connectedAt: 2_000, disconnectedAt: 2_500 });
    const sentTo: string[] = [];
    const gateway = {
      onEvent: () => () => undefined,
      snapshot: () => ({ sessions: [orphan, live], pairings: [], trustedClients: [], auditLog: [], enabled: true }),
      executeAction: (sessionId: string, command: { commandId?: string }) => {
        sentTo.push(sessionId);
        return { result: Promise.resolve({ commandId: command.commandId ?? "command", status: "succeeded" }) };
      }
    } as unknown as ClientGatewayService;
    const transport = new ClientGatewayRuntimeTransport({ gateway });

    await transport.dispatch({ kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" }, { preferredClientId: "extension.orphaned" });
    await transport.dispatch({ kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" }, { preferredSessionId: "session.orphan" });
    await transport.dispatch({ kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" });
    expect(sentTo).toEqual(["session.live", "session.live", "session.live"]);
  });

  it("rejects dispatch when no ready gateway client matches", async () => {
    const gateway = new ClientGatewayService();
    await pairGatewayClient(gateway, "extension.other", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });

    await expect(transport.dispatch({
      commandId: "command.nope",
      kind: "execute_action",
      domainId: "missing",
      actionType: "web.dom.click"
    })).resolves.toMatchObject({
      commandId: "command.nope",
      status: "rejected"
    });
  });

  it("forwards state while compatibility action results stay diagnostic", async () => {
    const gateway = new ClientGatewayService();
    const paired = await pairGatewayClient(gateway, "extension.events", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });
    const events: string[] = [];
    transport.onEvent((event) => {
      events.push(event.type);
    });

    await gateway.receive(paired.sessionId, clientMessage("client.state_update", {
      state: { ready: true },
      metadata: { domainId: "web-automation" }
    }));
    await gateway.receive(paired.sessionId, clientMessage("client.action_result", {
      commandId: "command.external",
      status: "failed",
      error: "boom"
    }));

    expect(events).toEqual(["state.update"]);
  });

  it("keeps a client-reported failure through dispatch and drops a malformed one", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const paired = await pairGatewayClient(gateway, "extension.failure", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });
    const failure = { category: "target_not_found", code: "web.target.selector_miss", retryable: true, stage: "target_resolution" } as const;

    const reported = transport.dispatch({ kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" });
    await gateway.receive(paired.sessionId, clientMessage("client.action_result", {
      commandId: lastExecuteCommandId(gateway, paired.sessionId),
      status: "failed",
      message: "No element matched.",
      failure
    }));
    await expect(reported).resolves.toMatchObject({ status: "failed", message: "No element matched.", failure });

    const malformed = transport.dispatch({ kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" });
    await gateway.receive(paired.sessionId, clientMessage("client.action_result", {
      commandId: lastExecuteCommandId(gateway, paired.sessionId),
      status: "failed",
      failure: { ...failure, stage: "execution" }
    }));
    const dropped = await malformed;
    expect(dropped.status).toBe("failed");
    expect(dropped).not.toHaveProperty("failure");
  });

  it("keeps unsolicited result failures and duplicates out of authoritative runtime events", async () => {
    const gateway = new ClientGatewayService();
    const paired = await pairGatewayClient(gateway, "extension.failure-event", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });
    const results: unknown[] = [];
    const diagnostics: unknown[] = [];
    transport.onEvent(event => { if (event.type === "command.result") results.push(event.result); });
    gateway.onEvent(event => { if (event.type === "client.action_result") diagnostics.push(event.message.payload); });
    const failure = { category: "auth_required", code: "web.auth.login_page", retryable: false } as const;
    for (const commandId of ["command.external", "command.external", "command.late"]) {
      await gateway.receive(paired.sessionId, clientMessage("client.action_result", { commandId, status: "failed", error: "Login required", failure }));
    }
    expect(diagnostics).toHaveLength(3);
    expect(results).toEqual([]);
  });

  it("emits exactly one RuntimeService completion from the awaited dispatch despite duplicate and late compatibility results", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const paired = await pairGatewayClient(gateway, "extension.authority", "user.web");
    const runtime = new RuntimeService();
    runtime.registerTransport(new ClientGatewayRuntimeTransport({ gateway }));
    const results: unknown[] = [];
    runtime.onEvent(event => { if (event.type === "command.result") results.push(event.result); });
    const pending = runtime.dispatch({ commandId: "command.authoritative", kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" });
    let commandId = "";
    await expect.poll(() => (commandId = lastExecuteCommandId(gateway, paired.sessionId))).not.toBe("");
    const failure = { category: "auth_required", code: "web.auth.login_page", retryable: false } as const;
    await gateway.receive(paired.sessionId, clientMessage("client.action_result", { commandId, status: "failed", error: "Login required", failure, clearedWait: { waitedMs: 12 } }));
    await expect(pending).resolves.toMatchObject({ status: "failed", failure, clearedWait: { waitedMs: 12 } });
    for (const lateId of [commandId, "command.external"]) {
      await gateway.receive(paired.sessionId, clientMessage("client.action_result", { commandId: lateId, status: "succeeded", message: "late" }));
    }
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: "failed", failure, clearedWait: { waitedMs: 12 } });
    await gateway.close();
  });
  it("screens generic cleared waits in awaited dispatch without compatibility completion events", async () => {
    const gateway = new ClientGatewayService();
    const paired = await pairGatewayClient(gateway, "extension.cleared", "user.web");
    const transport = new ClientGatewayRuntimeTransport({ gateway });
    const results: unknown[] = [];
    transport.onEvent((event) => { if (event.type === "command.result") results.push(event.result); });
    for (const clearedWait of [{ waitedMs: 12, extra: "discard" }, { waitedMs: -1 }, { waitedMs: 1.5 }, { waitedMs: "12" }, null]) {
      const dispatched = transport.dispatch({ kind: "execute_action", domainId: "web-automation", actionType: "web.dom.click" });
      await gateway.receive(paired.sessionId, clientMessage("client.action_result", {
        commandId: lastExecuteCommandId(gateway, paired.sessionId), status: "failed", clearedWait: clearedWait as unknown as { waitedMs: number }, payload: { checkWait: { waitedMs: 99 } }
      }));
      const result = await dispatched;
      if (clearedWait && typeof clearedWait.waitedMs === "number" && clearedWait.waitedMs === 12) {
        expect(result.clearedWait).toEqual({ waitedMs: 12 });
        expect(results).toEqual([]);
      } else {
        expect(result).not.toHaveProperty("clearedWait");
        expect(results).toEqual([]);
      }
    }
  });

});

function lastExecuteCommandId(gateway: ClientGatewayService, sessionId: string): string {
  const executes = gateway.outbound(sessionId).filter((message) => message.type === "server.execute_action");
  const last = executes[executes.length - 1];
  return last?.type === "server.execute_action" ? last.payload.commandId : "";
}

function gatewaySession(overrides: Partial<ClientGatewaySession> & { sessionId: string }): ClientGatewaySession {
  return {
    clientId: "extension.orphaned",
    clientType: "extension",
    name: "Web Extension",
    status: "ready",
    connectedAt: 1_000,
    lastSeenAt: 1_000,
    capabilities: [{ id: "web.actions", kind: "action", actionTypes: ["web.dom.click"], metadata: { domainId: "web-automation" } }],
    metadata: { domainId: "web-automation" },
    ...overrides
  };
}

async function pairGatewayClient(gateway: ClientGatewayService, clientId: string, approvedByUserId: string, options: { sessionDomain?: boolean; socket?: boolean } = {}) {
  const session = gateway.connect(options.socket ? { socket: { send: () => undefined } } : {});
  await gateway.receive(session.sessionId, clientMessage("client.hello", {
    clientId,
    clientType: "extension",
    name: "Web Extension",
    capabilities: [{
      id: "web.actions",
      kind: "action",
      actionTypes: ["web.dom.click"],
      metadata: { domainId: "web-automation" }
    }],
    ...(options.sessionDomain === false ? {} : { metadata: { domainId: "web-automation" } })
  }));
  const pairingCode = gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "";
  await gateway.approvePairing(pairingCode, { approvedByUserId });
  return session;
}

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(
  type: TType,
  payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]
): Extract<ClientGatewayClientMessage, { type: TType }> {
  return {
    id: `message.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    payload
  } as Extract<ClientGatewayClientMessage, { type: TType }>;
}
