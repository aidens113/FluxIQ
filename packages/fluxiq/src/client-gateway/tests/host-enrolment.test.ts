// A managed host the engine launched redeems a one-time enrolment ticket in its
// first hello and is trusted without any person's approval; a refused ticket is
// told its code and closed, never offered pairing (t907, design section A).

import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_ENROLMENT_REFUSALS,
  ClientGatewayService,
  FLUXIQ_MANAGED_HOST_PRINCIPAL,
  type ClientGatewayAuditEntry,
  type ClientGatewayServerMessage,
  type ClientGatewayTrustedClient,
  type ClientGatewayTrustedClientStore
} from "../index.ts";
import { clientMessage, ofKind, openTrace, pairClient, traceScope } from "./trace-tap-support.ts";

const WEB = "web-automation";

type Socket = { sent: ClientGatewayServerMessage[]; closed: Array<{ code: number | undefined; reason: string | undefined }> };

/** A client connected over a socket that keeps what it was sent and whether it was closed, and said hello. */
async function connectWith(gateway: ClientGatewayService, hello: { clientId: string; token?: string; enrolmentTicket?: string; domainId?: string | null }): Promise<{ sessionId: string; socket: Socket }> {
  const socket: Socket = { sent: [], closed: [] };
  const session = gateway.connect({
    socket: {
      send: (raw: string) => { socket.sent.push(JSON.parse(raw) as ClientGatewayServerMessage); },
      close: (code?: number, reason?: string) => { socket.closed.push({ code, reason }); }
    }
  });
  const domainId = hello.domainId === undefined ? WEB : hello.domainId;
  await gateway.receive(session.sessionId, clientMessage("client.hello", {
    clientId: hello.clientId,
    clientType: "extension",
    name: hello.clientId,
    ...(hello.token === undefined ? {} : { token: hello.token }),
    ...(hello.enrolmentTicket === undefined ? {} : { enrolmentTicket: hello.enrolmentTicket }),
    ...(domainId === null ? {} : { metadata: { domainId } })
  }));
  return { sessionId: session.sessionId, socket };
}

function ofType<TType extends ClientGatewayServerMessage["type"]>(socket: Socket, type: TType): Array<Extract<ClientGatewayServerMessage, { type: TType }>> {
  return socket.sent.filter((message): message is Extract<ClientGatewayServerMessage, { type: TType }> => message.type === type);
}

function sessionOf(gateway: ClientGatewayService, sessionId: string) {
  return gateway.snapshot().sessions.find((session) => session.sessionId === sessionId);
}

function audits(gateway: ClientGatewayService, type: string): ClientGatewayAuditEntry[] {
  return gateway.snapshot().auditLog.filter((entry) => entry.type === type);
}

class MemoryTrustedClientStore implements ClientGatewayTrustedClientStore {
  clients: ClientGatewayTrustedClient[] = [];
  /** While set, a save waits for it: the moment a client can leave while its trust is saved. */
  gate: Promise<void> | undefined;

  async load(): Promise<ClientGatewayTrustedClient[]> {
    return structuredClone(this.clients);
  }

  async save(clients: ClientGatewayTrustedClient[]): Promise<void> {
    await this.gate;
    this.clients = structuredClone(clients);
  }
}

describe("a managed host enrols with its ticket", () => {
  it("is ready with a token and its managed host id, acting for the managed-host principal, and no pairing is ever offered", async () => {
    const gateway = new ClientGatewayService({ createToken: () => "enrolled-secret" });
    const { ticket } = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    const { sessionId, socket } = await connectWith(gateway, { clientId: "extension.host-1", enrolmentTicket: ticket });

    const ready = ofType(socket, "server.session_ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]?.payload.sessionId).toBe(sessionId);
    expect(ready[0]?.payload.token).toContain("enrolled-secret");
    expect(ofType(socket, "server.pairing_required")).toHaveLength(0);
    expect(gateway.snapshot().pairings).toHaveLength(0);
    expect(sessionOf(gateway, sessionId)).toMatchObject({ status: "ready", managedHostId: "host-1", operatorUserId: FLUXIQ_MANAGED_HOST_PRINCIPAL, clientType: "extension" });
    expect(gateway.snapshot().trustedClients[0]).toMatchObject({ approvedByUserId: "fluxnode.owner", domainId: WEB, managedHost: { hostId: "host-1", profile: "fresh" } });
    expect((await gateway.authorizeToken(ready[0]?.payload.token))?.managedHostId).toBe("host-1");
    expect(audits(gateway, "session.enrolled")[0]?.metadata).toMatchObject({ sessionId, managedHostId: "host-1", profile: "fresh", approvedByUserId: "fluxnode.owner" });
    await gateway.close();
  });

  it("resumes on its token afterwards like any trusted client, keeping its managed host id", async () => {
    const tokens = ["first-secret", "rotated-secret"];
    const gateway = new ClientGatewayService({ createToken: () => tokens.shift() ?? "unexpected" });
    const { ticket } = gateway.managedHosts.issueHostEnrolment({ hostId: "host-2", domainId: WEB, profile: "named" });
    const first = await connectWith(gateway, { clientId: "extension.host-2", enrolmentTicket: ticket });
    const token = ofType(first.socket, "server.session_ready")[0]?.payload.token ?? "";
    gateway.disconnect(first.sessionId);

    const again = await connectWith(gateway, { clientId: "extension.host-2", token });

    expect(ofType(again.socket, "server.session_ready")[0]?.payload.token).toContain("rotated-secret");
    expect(sessionOf(gateway, again.sessionId)).toMatchObject({ status: "ready", managedHostId: "host-2" });
    await gateway.close();
  });

  it("ends the same host's earlier trust when it enrols again under the same client id", async () => {
    const gateway = new ClientGatewayService();
    const first = await connectWith(gateway, { clientId: "extension.host-1", enrolmentTicket: gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "named" }).ticket });
    const second = await connectWith(gateway, { clientId: "extension.host-1", enrolmentTicket: gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "named" }).ticket });

    expect(sessionOf(gateway, second.sessionId)?.status).toBe("ready");
    expect(sessionOf(gateway, first.sessionId)?.status).toBe("disconnected");
    expect(gateway.snapshot().trustedClients.map((client) => client.status).sort()).toEqual(["active", "revoked"]);
    await gateway.close();
  });
});

describe("a refused ticket is told its code and closed, never offered pairing", () => {
  async function refused(present: (gateway: ClientGatewayService) => Promise<{ sessionId: string; socket: Socket }>, code: string) {
    const gateway = new ClientGatewayService();
    const { sessionId, socket } = await present(gateway);
    expect(ofType(socket, "server.error").map((message) => message.payload.code)).toEqual([code]);
    expect(ofType(socket, "server.disconnect")).toHaveLength(1);
    expect(ofType(socket, "server.session_ready")).toHaveLength(0);
    expect(ofType(socket, "server.pairing_required")).toHaveLength(0);
    expect(socket.closed).toHaveLength(1);
    expect(sessionOf(gateway, sessionId)?.status).toBe("disconnected");
    expect(gateway.snapshot().pairings).toHaveLength(0);
    expect(audits(gateway, "enrolment.refused").at(-1)?.metadata).toMatchObject({ sessionId, code });
    await gateway.close();
    return gateway;
  }

  it("refuses an unknown ticket", async () => {
    await refused((gateway) => connectWith(gateway, { clientId: "extension.x", enrolmentTicket: "fxet_never-minted-by-this-engine" }), CLIENT_GATEWAY_ENROLMENT_REFUSALS.unknown.code);
  });

  it("refuses an expired ticket", async () => {
    const clock = { now: 1_000 };
    const gateway = new ClientGatewayService({ now: () => clock.now });
    const { ticket, expiresAt } = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    clock.now = expiresAt + 1;
    const { socket } = await connectWith(gateway, { clientId: "extension.x", enrolmentTicket: ticket });
    expect(ofType(socket, "server.error")[0]?.payload.code).toBe(CLIENT_GATEWAY_ENROLMENT_REFUSALS.expired.code);
    expect(ofType(socket, "server.pairing_required")).toHaveLength(0);
    expect(socket.closed).toHaveLength(1);
    await gateway.close();
  });

  it("consumes a ticket on first presentation: a second presentation is refused as used", async () => {
    let ticket = "";
    await refused(async (gateway) => {
      ticket = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" }).ticket;
      const first = await connectWith(gateway, { clientId: "extension.first", enrolmentTicket: ticket });
      expect(sessionOf(gateway, first.sessionId)?.status).toBe("ready");
      return connectWith(gateway, { clientId: "extension.replayer", enrolmentTicket: ticket });
    }, CLIENT_GATEWAY_ENROLMENT_REFUSALS.used.code);
  });

  it("refuses a ticket presented by a client declaring another domain, or none, and consumes it", async () => {
    await refused(async (gateway) => {
      const { ticket } = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" });
      const mismatched = await connectWith(gateway, { clientId: "extension.x", enrolmentTicket: ticket, domainId: "desktop-automation" });
      expect(ofType(mismatched.socket, "server.error")[0]?.payload.code).toBe(CLIENT_GATEWAY_ENROLMENT_REFUSALS.domainMismatch.code);
      const undeclared = await connectWith(gateway, { clientId: "extension.y", enrolmentTicket: gateway.managedHosts.issueHostEnrolment({ hostId: "host-2", domainId: WEB, profile: "fresh" }).ticket, domainId: null });
      expect(ofType(undeclared.socket, "server.error")[0]?.payload.code).toBe(CLIENT_GATEWAY_ENROLMENT_REFUSALS.domainMismatch.code);
      return connectWith(gateway, { clientId: "extension.x", enrolmentTicket: ticket });
    }, CLIENT_GATEWAY_ENROLMENT_REFUSALS.used.code);
  });

  it("revokes a host's earlier live ticket when another is issued for it", async () => {
    await refused(async (gateway) => {
      const earlier = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" }).ticket;
      gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" });
      return connectWith(gateway, { clientId: "extension.x", enrolmentTicket: earlier });
    }, CLIENT_GATEWAY_ENROLMENT_REFUSALS.revoked.code);
  });

  it("refuses a ticket even when the hello also carries a token, and does not resume on the token", async () => {
    const gateway = new ClientGatewayService();
    const paired = await pairClient(gateway, "extension.both", { domainId: WEB });
    gateway.disconnect(paired.sessionId);
    const { sessionId, socket } = await connectWith(gateway, { clientId: "extension.both", token: paired.token, enrolmentTicket: "fxet_never-minted-by-this-engine" });
    expect(ofType(socket, "server.error")[0]?.payload.code).toBe(CLIENT_GATEWAY_ENROLMENT_REFUSALS.unknown.code);
    expect(sessionOf(gateway, sessionId)?.status).toBe("disconnected");
    await gateway.close();
  });
});

describe("a managed host's credentials stay out of what Core records", () => {
  it("never puts the ticket or the token in the audit, a security event or a trace", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.enrolment");
    const securityEvents: unknown[] = [];
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source, createToken: () => "minted-credential-secret" });
    gateway.onSecurityEvent((event) => {
      securityEvents.push(event);
    });
    const first = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" }).ticket;
    const enrolled = await connectWith(gateway, { clientId: "extension.traced", enrolmentTicket: first });
    // Claims the client for the trace, so its next connection's hello is recorded.
    scope.within(trace.recorder, () => gateway.executeAction(enrolled.sessionId, { actionType: "example.press" }));
    const second = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" }).ticket;
    const traced = await connectWith(gateway, { clientId: "extension.traced", enrolmentTicket: second });
    await connectWith(gateway, { clientId: "extension.traced", enrolmentTicket: second });
    const token = ofType(traced.socket, "server.session_ready")[0]?.payload.token ?? "";
    expect(token).toContain("minted-credential-secret");

    const events = await trace.events();
    const hellos = ofKind(events, "inbound", "client.hello");
    expect(hellos.length).toBeGreaterThan(0);
    for (const hello of hellos) {
      expect(hello.payload).toMatchObject({ encoding: "json", value: { payload: { enrolmentTicket: { redacted: "credential" } } } });
      expect(hello.redactions).toEqual([{ path: "/payload/enrolmentTicket", reason: "credential" }]);
    }
    const recorded = JSON.stringify([events, gateway.snapshot(), securityEvents]);
    for (const secret of [first, second, token]) expect(recorded).not.toContain(secret);
    expect(recorded).not.toContain("minted-credential-secret");
    expect(securityEvents.map((event) => (event as { type: string }).type)).toEqual(expect.arrayContaining(["session.enrolled", "enrolment.refused"]));
    await gateway.close();
  });

  it("redacts a ticket in a hello handed over with the connection", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.connect-hello");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const paired = await pairClient(gateway, "extension.handed", { domainId: WEB });
    scope.within(trace.recorder, () => gateway.executeAction(paired.sessionId, { actionType: "example.press" }));
    const { ticket } = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    gateway.connect({ socket: { send: () => undefined }, hello: { clientId: "extension.handed", clientType: "extension", enrolmentTicket: ticket, metadata: { domainId: WEB } } });

    const connected = ofKind(await trace.events(), "lifecycle", "session.connected").at(-1);
    expect(connected?.payload).toMatchObject({ encoding: "json", value: { hello: { enrolmentTicket: { redacted: "credential" } } } });
    expect(JSON.stringify(await trace.events())).not.toContain(ticket);
    await gateway.close();
  });
});

describe("managed hosts end with their engine", () => {
  it("revokes a host's trust and live ticket, and closes its session", async () => {
    const gateway = new ClientGatewayService();
    const enrolled = await connectWith(gateway, { clientId: "extension.host-1", enrolmentTicket: gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" }).ticket });
    const other = await connectWith(gateway, { clientId: "extension.host-2", enrolmentTicket: gateway.managedHosts.issueHostEnrolment({ hostId: "host-2", domainId: WEB, profile: "fresh" }).ticket });
    const unused = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" }).ticket;

    expect(await gateway.managedHosts.revokeManagedHost("host-1")).toBe(1);

    expect(sessionOf(gateway, enrolled.sessionId)?.status).toBe("disconnected");
    expect(ofType(enrolled.socket, "server.disconnect")).toHaveLength(1);
    expect(sessionOf(gateway, other.sessionId)?.status).toBe("ready");
    const late = await connectWith(gateway, { clientId: "extension.host-1", enrolmentTicket: unused });
    expect(ofType(late.socket, "server.error")[0]?.payload.code).toBe(CLIENT_GATEWAY_ENROLMENT_REFUSALS.revoked.code);
    await gateway.close();
  });

  it("at the next start, revokes every fresh-profile host's trust and keeps named hosts and paired clients", async () => {
    const store = new MemoryTrustedClientStore();
    const before = new ClientGatewayService({ trustedClientStore: store });
    await connectWith(before, { clientId: "extension.fresh", enrolmentTicket: before.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" }).ticket });
    const named = await connectWith(before, { clientId: "extension.named", enrolmentTicket: before.managedHosts.issueHostEnrolment({ hostId: "host-2", domainId: WEB, profile: "named" }).ticket });
    await pairClient(before, "extension.person", { domainId: WEB });
    const namedToken = ofType(named.socket, "server.session_ready")[0]?.payload.token ?? "";
    await before.close();

    const after = new ClientGatewayService({ trustedClientStore: store });
    expect(await after.managedHosts.revokeStaleManagedHosts()).toBe(1);

    const status = Object.fromEntries(after.snapshot().trustedClients.map((client) => [client.clientId, client.status]));
    expect(status).toEqual({ "extension.fresh": "revoked", "extension.named": "active", "extension.person": "active" });
    expect(store.clients.find((client) => client.clientId === "extension.named")?.managedHost).toEqual({ hostId: "host-2", profile: "named" });
    const resumed = await connectWith(after, { clientId: "extension.named", token: namedToken });
    expect(sessionOf(after, resumed.sessionId)).toMatchObject({ status: "ready", managedHostId: "host-2" });
    await after.close();
  });

  it("takes the trust back when the host leaves while its trust is being saved", async () => {
    const store = new MemoryTrustedClientStore();
    const gateway = new ClientGatewayService({ trustedClientStore: store });
    await gateway.ready();
    let release = (): void => undefined;
    store.gate = new Promise<void>((resolve) => { release = resolve; });
    const socket: Socket = { sent: [], closed: [] };
    const session = gateway.connect({ socket: { send: (raw: string) => { socket.sent.push(JSON.parse(raw) as ClientGatewayServerMessage); } } });
    const { ticket } = gateway.managedHosts.issueHostEnrolment({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    const hello = gateway.receive(session.sessionId, clientMessage("client.hello", { clientId: "extension.leaving", clientType: "extension", enrolmentTicket: ticket, metadata: { domainId: WEB } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    gateway.disconnect(session.sessionId, "socket closed");
    store.gate = undefined;
    release();
    await hello;

    expect(ofType(socket, "server.session_ready")).toHaveLength(0);
    expect(gateway.snapshot().trustedClients.map((client) => client.status)).toEqual(["revoked"]);
    expect(audits(gateway, "enrolment.abandoned")[0]?.metadata).toEqual({ sessionId: session.sessionId, managedHostId: "host-1" });
    await gateway.close();
  });
});
