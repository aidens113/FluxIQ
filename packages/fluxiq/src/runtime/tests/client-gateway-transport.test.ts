import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../../client-gateway/index.ts";
import { RuntimeService, ClientGatewayRuntimeTransport } from "../index.ts";

describe("ClientGatewayRuntimeTransport", () => {
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

async function pairGatewayClient(gateway: ClientGatewayService, clientId: string, approvedByUserId: string) {
  const session = gateway.connect();
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
    metadata: { domainId: "web-automation" }
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
