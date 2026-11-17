import { afterEach } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewaySocket } from "../../../index.ts";
import type { ClientGatewayCredentialCustody } from "../../credential-custody.ts";
import { RevocationStore } from "./store.ts";

const gateways: ClientGatewayService[] = [];

afterEach(async () => {
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

export async function revocationFixture(options: { now?: number; custody?: ClientGatewayCredentialCustody; socket?: ClientGatewaySocket } = {}) {
  const store = new RevocationStore();
  const clock = { now: options.now ?? 1_000_000 };
  let minted = 0;
  const gateway = new ClientGatewayService({
    trustedClientStore: store,
    now: () => clock.now,
    createToken: () => `synthetic-revoke-${minted += 1}`,
    ...(options.custody ? { credentialCustody: options.custody } : {})
  });
  gateways.push(gateway);
  const pair = async (clientId = "extension.revocation", socket = options.socket) => {
    const session = gateway.connect(socket ? { socket } : {});
    const hello: ClientGatewayClientMessage = {
      id: `hello-${clientId}`,
      type: "client.hello",
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: clock.now,
      payload: { clientId, clientType: "extension", name: "Synthetic browser" }
    };
    await gateway.receive(session.sessionId, hello);
    const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId)!;
    await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.revocation" });
    const ready = gateway.outbound(session.sessionId).find((message) => message.type === "server.session_ready")!;
    const token = (ready.payload as { token: string }).token;
    const trustedClientId = gateway.trustedClientIdOf(session.sessionId)!;
    return { sessionId: session.sessionId, token, trustedClientId };
  };
  const paired = await pair();
  return { gateway, store, clock, pair, ...paired };
}
