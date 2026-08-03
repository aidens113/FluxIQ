import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage } from "./contracts";
import { ClientGatewayService } from "./service";

describe("ClientGatewayService", () => {
  it("pairs a websocket-capable client and queues session messages", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.local",
      clientType: "extension",
      name: "Local recorder",
      capabilities: [{ id: "sample.record", kind: "recording", actionTypes: ["sample.action"] }]
    }));
    expect(gateway.snapshot().sessions[0]?.status).toBe("pairing_required");

    const pairing = gateway.snapshot().pairings[0];
    await gateway.approvePairing(pairing?.pairingCode ?? "");

    const readySession = gateway.snapshot().sessions[0];
    expect(readySession?.status).toBe("ready");
    expect(gateway.outbound(session.sessionId).some((message) => message.type === "server.session_ready")).toBe(true);
  });

  it("creates a pending pairing request when an unpaired client says hello", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.request",
      clientType: "extension",
      name: "Extension Connect Button"
    }));

    const snapshot = gateway.snapshot();
    const pairing = snapshot.pairings[0];
    expect(pairing).toMatchObject({
      requestedBySessionId: session.sessionId,
      requestedByClientId: "extension.request",
      requestedByClientName: "Extension Connect Button"
    });
    expect(pairing?.pairingCode).toMatch(/^\d{6}$/);
    expect(gateway.outbound(session.sessionId).find((message) => message.type === "server.pairing_required")?.payload.referenceCode).toBe(pairing?.referenceCode);
  });

  it("approves pending pairing requests from the web panel", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.approve",
      clientType: "extension",
      name: "Approve Test"
    }));
    const pairingCode = gateway.snapshot().pairings[0]?.pairingCode ?? "";

    const approved = await gateway.approvePairing(pairingCode);

    expect(approved?.status).toBe("ready");
    expect(gateway.outbound(session.sessionId).some((message) => message.type === "server.session_ready")).toBe(true);
  });

  it("dismisses pending pairing requests", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.dismiss",
      clientType: "extension",
      name: "Dismiss Test"
    }));
    const pairingCode = gateway.snapshot().pairings[0]?.pairingCode;

    expect(pairingCode).toBeTruthy();
    expect(gateway.dismissPairing(pairingCode ?? "")).toBe(true);
    expect(gateway.snapshot().pairings).toHaveLength(0);
  });

  it("authorizes active paired session tokens", async () => {
    const gateway = new ClientGatewayService();
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", {
      clientId: "extension.authorized",
      clientType: "extension",
      name: "Authorized Test"
    }));
    const pairingCode = gateway.snapshot().pairings[0]?.pairingCode ?? "";
    await gateway.approvePairing(pairingCode);
    const token = gateway.snapshot().sessions[0]?.token;

    expect(gateway.authorizeToken(token)?.clientId).toBe("extension.authorized");
    expect(gateway.authorizeToken("missing-token")).toBeNull();
  });

  it("correlates execute_action commands with client action results", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const session = gateway.connect();
    await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "worker.1", clientType: "worker", name: "Worker" }));
    const pairing = gateway.snapshot().pairings[0];
    await gateway.approvePairing(pairing?.pairingCode ?? "");

    const response = gateway.executeAction(session.sessionId, { actionType: "click", parameters: { selector: "#save" } });
    await gateway.receive(session.sessionId, clientMessage("client.action_result", {
      commandId: response.commandId,
      status: "succeeded",
      message: "clicked"
    }));

    await expect(response.result).resolves.toMatchObject({ commandId: response.commandId, status: "succeeded" });
  });
});

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
