import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  type ClientGatewayClientMessage,
  type ClientGatewayTrustedClient,
  type ClientGatewayTrustedClientStore
} from "../../index.ts";

// t707 C2: a browser's socket can close while the person is still reading the
// code. Approving that pairing used to mint durable trust, send the token to the
// closed socket and flip the dead session to `ready`, while the panel said the
// pairing worked. Approval is only for a session that is still waiting.
describe("ClientGatewayPairingFlow approval of a session that is no longer waiting", () => {
  it("refuses a pairing whose browser disconnected, creating no trust and sending no token", async () => {
    const gateway = new ClientGatewayService();
    const { sessionId, pairingCode } = await waitingClient(gateway, "extension.gone");

    gateway.disconnect(sessionId, "socket closed");

    await expect(gateway.approvePairing(pairingCode, { approvedByUserId: "user.web" })).rejects.toMatchObject({
      code: "pairing.client_disconnected",
      message: expect.stringMatching(/disconnected.*reconnect/i)
    });
    const snapshot = gateway.snapshot();
    expect(snapshot.trustedClients).toEqual([]);
    expect(snapshot.sessions.find((session) => session.sessionId === sessionId)).toMatchObject({ status: "disconnected" });
    expect(gateway.outbound(sessionId).some((message) => message.type === "server.session_ready")).toBe(false);
  });

  it("stops offering a disconnected session's pairing as approvable", async () => {
    const gateway = new ClientGatewayService();
    const { sessionId, pairingCode } = await waitingClient(gateway, "extension.withdrawn");

    gateway.disconnect(sessionId, "socket closed");

    expect(gateway.snapshot().pairings.some((pairing) => pairing.pairingCode === pairingCode)).toBe(false);
    expect(gateway.summary().counts.pairings).toBe(0);
  });

  it("revokes the trust it minted when the browser disconnects while the approval is being saved", async () => {
    let releaseSave: () => void = () => undefined;
    let saves = 0;
    let saved: ClientGatewayTrustedClient[] = [];
    const store: ClientGatewayTrustedClientStore = {
      load: async () => [],
      save: async (clients) => {
        saves += 1;
        if (saves === 1) await new Promise<void>((resolve) => { releaseSave = resolve; });
        saved = clients.map((client) => ({ ...client }));
      }
    };
    const gateway = new ClientGatewayService({ trustedClientStore: store });
    const { sessionId, pairingCode } = await waitingClient(gateway, "extension.race");

    const approving = gateway.approvePairing(pairingCode, { approvedByUserId: "user.web" });
    await expect.poll(() => saves).toBe(1);
    gateway.disconnect(sessionId, "socket closed");
    releaseSave();

    await expect(approving).rejects.toMatchObject({ code: "pairing.client_disconnected" });
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)).toMatchObject({ status: "disconnected" });
    expect(gateway.outbound(sessionId).some((message) => message.type === "server.session_ready")).toBe(false);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.revokedAt).toEqual(expect.any(Number));
  });

  it("refuses a pairing for a session that is already paired", async () => {
    const gateway = new ClientGatewayService();
    const { sessionId, pairingCode } = await waitingClient(gateway, "extension.paired");
    await gateway.approvePairing(pairingCode, { approvedByUserId: "user.web" });
    const second = gateway.createPairing({ requestedBySessionId: sessionId, requestedByClientId: "extension.paired" });

    await expect(gateway.approvePairing(second.pairingCode, { approvedByUserId: "user.web" })).rejects.toMatchObject({ code: "pairing.not_waiting" });
    expect(gateway.snapshot().trustedClients).toHaveLength(1);
  });

  it("still pairs a session that is waiting", async () => {
    const gateway = new ClientGatewayService();
    const { sessionId, pairingCode } = await waitingClient(gateway, "extension.live");

    await expect(gateway.approvePairing(pairingCode, { approvedByUserId: "user.web" })).resolves.toMatchObject({ sessionId, status: "ready" });
    expect(gateway.outbound(sessionId).some((message) => message.type === "server.session_ready")).toBe(true);
  });
});

async function waitingClient(gateway: ClientGatewayService, clientId: string): Promise<{ sessionId: string; pairingCode: string }> {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, clientMessage("client.hello", { clientId, clientType: "extension", name: "Web Extension" }));
  const pairingCode = gateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "";
  expect(pairingCode).not.toBe("");
  return { sessionId: session.sessionId, pairingCode };
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
