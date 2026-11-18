import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayChange, type ClientGatewayClientMessage } from "../index.ts";

// t916: the panel learns of pairing and client changes by push
// (`ClientGatewayService.changes`), so each change the snapshot would show is
// signalled once, as a kind and a version and nothing that names the client.

function hello(): ClientGatewayClientMessage {
  return {
    id: `message.${Math.random().toString(36).slice(2)}`,
    type: "client.hello",
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: Date.now(),
    payload: { clientId: "extension.changes", clientType: "extension", name: "Changes Test" }
  } as ClientGatewayClientMessage;
}

const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

async function watched() {
  const gateway = new ClientGatewayService();
  const seen: ClientGatewayChange[] = [];
  gateway.changes.subscribe((change) => seen.push(change));
  return { gateway, seen };
}

async function requested(gateway: ClientGatewayService) {
  const session = gateway.connect();
  await gateway.receive(session.sessionId, hello());
  await settled();
  return { session, pairing: gateway.snapshot().pairings[0]! };
}

describe("ClientGatewayService.changes", () => {
  it("signals a pairing request once, and its approval once", async () => {
    const { gateway, seen } = await watched();
    await requested(gateway);
    expect(seen).toEqual([{ kind: "pairing.requested", version: 1 }]);

    const pairingCode = gateway.snapshot().pairings[0]!.pairingCode;
    await gateway.approvePairing(pairingCode, { approvedByUserId: "user.approver" });
    await settled();
    expect(seen).toEqual([{ kind: "pairing.requested", version: 1 }, { kind: "pairing.approved", version: 2 }]);
    expect(gateway.changes.version()).toBe(2);
  });

  it("never carries a pairing code, a credential or which client or session it was about", async () => {
    const { gateway, seen } = await watched();
    const { session, pairing } = await requested(gateway);
    const approved = await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.approver" });
    await settled();
    const token = gateway.outbound(session.sessionId).flatMap((message) => message.type === "server.session_ready" ? [String(message.payload.token)] : [])[0];
    expect(token).toBeTruthy();
    await gateway.revokeTrustedClient(approved!.trustedClientId!);
    await settled();

    const wire = JSON.stringify(seen);
    for (const secret of [pairing.pairingCode, token!, session.sessionId, approved!.trustedClientId!, "extension.changes", "Changes Test", "user.approver"]) expect(wire).not.toContain(secret);
    for (const change of seen) expect(Object.keys(change).sort()).toEqual(["kind", "version"]);
  });

  it("signals a dismissal, a revocation and a disconnect", async () => {
    const { gateway, seen } = await watched();
    const first = await requested(gateway);
    expect(gateway.dismissPairing(first.pairing.pairingCode)).toBe(true);
    await settled();
    expect(seen.at(-1)?.kind).toBe("pairing.denied");

    const second = await requested(gateway);
    const approved = await gateway.approvePairing(second.pairing.pairingCode, { approvedByUserId: "user.approver" });
    await settled();
    await gateway.revokeTrustedClient(approved!.trustedClientId!);
    await settled();
    expect(seen.map((change) => change.kind)).toContain("client.revoked");
    // Revoking a connected client also ends its session.
    expect(seen.at(-1)?.kind).toBe("client.disconnected");
  });

  it("signals a pending request withdrawn when its browser disconnects", async () => {
    const { gateway, seen } = await watched();
    const { session } = await requested(gateway);
    gateway.disconnect(session.sessionId, "socket closed");
    await settled();
    // The withdrawal and the disconnect are one change: the snapshot is read once for both.
    expect(seen.map((change) => change.kind)).toEqual(["pairing.requested", "pairing.withdrawn"]);
  });

  it("does not signal a session attached under a channel scope, nor its end", async () => {
    const { gateway, seen } = await watched();
    const scoped = gateway.attachScopedSession({ scopeId: "trial-1", socket: { send: () => undefined }, hello: { clientId: "ignored", clientType: "extension" } });
    gateway.disconnect(scoped.sessionId, "trial ended");
    await settled();
    expect(seen).toEqual([]);
  });
});
