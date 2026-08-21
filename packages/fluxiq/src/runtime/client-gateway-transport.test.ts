import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage } from "../client-gateway/index.ts";
import { ClientGatewayRuntimeTransport } from "./client-gateway-transport.ts";

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

  it("forwards gateway state and action-result events as runtime events", async () => {
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

    expect(events).toEqual(["state.update", "command.result"]);
  });
});

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
