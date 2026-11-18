import { expect } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../client-gateway/index.ts";
import type { ClientGatewayClientMessage, ClientGatewayService } from "../../../client-gateway/index.ts";

/** Test-only client drives the real gateway handshake and pairing lifecycle. */
export function gatewaySession(gateway: ClientGatewayService, clientId = "extension.same-client-id") {
  function message<T extends ClientGatewayClientMessage["type"]>(type: T, payload: Extract<ClientGatewayClientMessage, { type: T }>["payload"]): Extract<ClientGatewayClientMessage, { type: T }> {
    return { id: `synthetic.${Math.random()}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1, payload } as Extract<ClientGatewayClientMessage, { type: T }>;
  }
  function credential(sessionId: string): string | undefined {
    const ready = gateway.outbound(sessionId).filter((entry) => entry.type === "server.session_ready").at(-1);
    return (ready?.payload as { token?: string } | undefined)?.token;
  }
  async function hello(token?: string) {
    const session = gateway.connect();
    const payload: { clientId: string; clientType: "extension"; name: string; metadata: { domainId: string }; token?: string } = { clientId, clientType: "extension", name: "Synthetic browser", metadata: { domainId: "synthetic-domain" } };
    if (token !== undefined) payload.token = token;
    await gateway.receive(session.sessionId, message("client.hello", payload));
    const status = gateway.snapshot().sessions.find((entry) => entry.sessionId === session.sessionId)?.status;
    return { sessionId: session.sessionId, status, token: credential(session.sessionId) };
  }
  return {
    hello,
    async pair() {
      const waiting = await hello();
      const code = gateway.snapshot().pairings.find((entry) => entry.requestedBySessionId === waiting.sessionId)?.pairingCode;
      expect(code).toBeTruthy();
      await gateway.approvePairing(code!, { approvedByUserId: "user.synthetic" });
      const token = credential(waiting.sessionId);
      expect(token).toBeTruthy();
      return { sessionId: waiting.sessionId, token: token! };
    },
    confirm: (sessionId: string) => gateway.receive(sessionId, message("client.credential_received", {}))
  };
}
