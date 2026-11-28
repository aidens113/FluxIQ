import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// t1095 RC1: a code lapses after its lifetime while the browser still waits on
// the same socket. Nothing gave it a new one until a new socket sent a new
// hello, so the panel showed nothing and the person had to cancel and resend.
describe("ClientGatewayPairingFlow renewal of a lapsed code", () => {
  const TTL_MS = 1_000;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function pairingCodes(gateway: ClientGatewayService, sessionId: string): string[] {
    return gateway.outbound(sessionId).flatMap((message) => message.type === "server.pairing_required" ? [message.payload.referenceCode ?? ""] : []);
  }

  it("renews an expired code for a browser still waiting on the same socket and sends it server.pairing_required again", async () => {
    const gateway = new ClientGatewayService({ pairingTtlMs: TTL_MS });
    const kinds: string[] = [];
    gateway.changes.subscribe((change) => { kinds.push(change.kind); });
    const { sessionId, pairingCode } = await waitingClient(gateway, "extension.late");
    await vi.advanceTimersByTimeAsync(0);
    kinds.length = 0;

    await vi.advanceTimersByTimeAsync(TTL_MS + 1);

    const pending = gateway.snapshot().pairings.filter((pairing) => pairing.requestedBySessionId === sessionId);
    expect(pending).toHaveLength(1);
    const renewed = pending[0]!;
    expect(renewed.pairingCode).not.toBe(pairingCode);
    // Each code keeps its own lifetime.
    expect(renewed.expiresAt).toBe(Date.now() + TTL_MS);
    expect(pairingCodes(gateway, sessionId)).toEqual([pairingCode, renewed.pairingCode]);
    const repeat = gateway.outbound(sessionId).filter((message) => message.type === "server.pairing_required").at(-1);
    expect(repeat?.payload).not.toHaveProperty("credential");
    expect(gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)).toMatchObject({ status: "pairing_required" });
    // The lapse and the renewal are one change for a reader.
    expect(kinds).toHaveLength(1);

    // The renewed code is approvable on the same socket, with no resend.
    await expect(gateway.approvePairing(renewed.pairingCode, { approvedByUserId: "user.web" })).resolves.toMatchObject({ sessionId, status: "ready" });
  });

  it("keeps renewing for as long as the browser waits", async () => {
    const gateway = new ClientGatewayService({ pairingTtlMs: TTL_MS });
    const { sessionId } = await waitingClient(gateway, "extension.patient");

    await vi.advanceTimersByTimeAsync(TTL_MS + 1);
    await vi.advanceTimersByTimeAsync(TTL_MS + 1);

    expect(new Set(pairingCodes(gateway, sessionId)).size).toBe(3);
    expect(gateway.snapshot().pairings.filter((pairing) => pairing.requestedBySessionId === sessionId)).toHaveLength(1);
  });

  it("does not renew for a disconnected, ready or dismissed session", async () => {
    const gateway = new ClientGatewayService({ pairingTtlMs: TTL_MS });
    const gone = await waitingClient(gateway, "extension.gone");
    const paired = await waitingClient(gateway, "extension.paired");
    const dismissed = await waitingClient(gateway, "extension.dismissed");
    gateway.disconnect(gone.sessionId, "socket closed");
    await gateway.approvePairing(paired.pairingCode, { approvedByUserId: "user.web" });
    // A paired session's other code, which lapses while it is ready.
    gateway.createPairing({ requestedBySessionId: paired.sessionId, requestedByClientId: "extension.paired" });
    gateway.dismissPairing(dismissed.pairingCode);

    await vi.advanceTimersByTimeAsync(TTL_MS + 1);

    expect(gateway.snapshot().pairings.filter((pairing) => !pairing.consumedAt)).toEqual([]);
    expect(pairingCodes(gateway, gone.sessionId)).toEqual([gone.pairingCode]);
    expect(pairingCodes(gateway, paired.sessionId)).toEqual([paired.pairingCode]);
    expect(pairingCodes(gateway, dismissed.sessionId)).toEqual([dismissed.pairingCode]);
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
