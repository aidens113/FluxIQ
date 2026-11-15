import { describe, expect, it } from "vitest";
import type { ClientGatewaySessionMetadata } from "../index.ts";
import { deferred, harness, hello, pair, ready, SUMMARY, waiting } from "./fixture.ts";

describe("actual session-ready server metadata", () => {
  it("sends real validated identity and committed expiry from both grant and resume", async () => {
    const f = harness();
    const provided = { ...structuredClone(SUMMARY), credentialExpiresAt: 12, credential: "synthetic.provider.secret" };
    f.provider.mockResolvedValue(provided);
    const first = await pair(f.gateway);
    const grant = ready(f.gateway, first.sessionId)!;
    expect(grant).toMatchObject(SUMMARY);
    expect(grant.credentialExpiresAt).toBe(f.saved.clients[0]!.expiresAt);
    expect(grant.credentialExpiresAt).not.toBe(12);
    expect(grant.user).not.toBe(provided.user);
    expect(JSON.stringify(grant)).not.toContain("synthetic.provider.secret");
    const current = f.gateway.connect();
    f.clock.now += 1_000;
    await f.gateway.receive(current.sessionId, hello(first.token));
    const resumed = ready(f.gateway, current.sessionId)!;
    expect(resumed).toMatchObject(SUMMARY);
    expect(resumed.credentialExpiresAt).toBe(f.saved.clients[0]!.expiresAt);
    expect(resumed.token).not.toBe(first.token);
    expect(f.provider.mock.calls.every(([input]) => Object.isFrozen(input))).toBe(true);
    for (const [input] of f.provider.mock.calls) expect(input).toEqual({ trustedClientId: f.saved.clients[0]!.trustedClientId, userId: SUMMARY.user.userId, clientType: "extension" });
    provided.user.displayName = "Changed later";
    expect(grant.user!.displayName).toBe(SUMMARY.user.displayName);
  });

  it("keeps generic local omission compatible while reporting actual expiry", async () => {
    const f = harness({ local: true });
    const first = await pair(f.gateway);
    expect(ready(f.gateway, first.sessionId)).toMatchObject({ credentialExpiresAt: f.saved.clients[0]!.expiresAt });
    expect(ready(f.gateway, first.sessionId)!.user).toBeUndefined();
    const next = f.gateway.connect();
    await f.gateway.receive(next.sessionId, hello(first.token));
    expect(ready(f.gateway, next.sessionId)!.workspace).toBeUndefined();
    expect(f.provider).not.toHaveBeenCalled();
  });

  it("uses only authoritative managed-host trust to bypass the human provider", async () => {
    const f = harness();
    f.provider.mockRejectedValue(new Error("synthetic.unavailable"));
    const { ticket } = f.gateway.managedHosts.issueHostEnrolment({ hostId: "host.metadata", domainId: "web-automation", profile: "named" });
    const session = f.gateway.connect();
    const message = hello();
    if (message.type !== "client.hello") throw new Error("Expected hello.");
    message.payload.enrolmentTicket = ticket;
    message.payload.metadata = { domainId: "web-automation" };
    await f.gateway.receive(session.sessionId, message);
    const granted = ready(f.gateway, session.sessionId)!;
    expect(granted.user).toBeUndefined();
    expect(granted.credentialExpiresAt).toBe(f.saved.clients[0]!.expiresAt);
    const resumed = f.gateway.connect();
    const resume = hello(granted.token);
    if (resume.type !== "client.hello") throw new Error("Expected hello.");
    resume.payload.metadata = { domainId: "web-automation" };
    await f.gateway.receive(resumed.sessionId, resume);
    expect(ready(f.gateway, resumed.sessionId)).toBeDefined();
    expect(f.provider).not.toHaveBeenCalled();
  });

  it("does not accept a hello's fake managed-host exception", async () => {
    const f = harness();
    f.provider.mockResolvedValue(null);
    const pending = await waiting(f.gateway);
    f.sessions.get(pending.sessionId)!.metadata = { managedHost: { hostId: "claimed" }, managedHostId: "claimed" };
    await expect(pending.approve()).rejects.toMatchObject({ code: "client_gateway.session_metadata_unavailable" });
    expect(ready(f.gateway, pending.sessionId)).toBeUndefined();
    expect(f.provider).toHaveBeenCalled();
  });

  it("preserves actual managed-enrolment abandonment during awaited custody", async () => {
    const f = harness();
    f.provider.mockRejectedValue(new Error("Human provider is unavailable."));
    const entered = deferred<void>();
    const release = deferred<void>();
    f.custody.issued.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const { ticket } = f.gateway.managedHosts.issueHostEnrolment({ hostId: "host.abandoned", domainId: "web-automation", profile: "named" });
    const session = f.gateway.connect();
    const message = hello();
    if (message.type !== "client.hello") throw new Error("Expected hello.");
    message.payload.enrolmentTicket = ticket;
    message.payload.metadata = { domainId: "web-automation" };
    const receiving = f.gateway.receive(session.sessionId, message);
    await entered.promise;
    f.gateway.disconnect(session.sessionId, "managed socket left");
    release.resolve();
    await expect(receiving).resolves.toBeUndefined();
    expect(ready(f.gateway, session.sessionId)).toBeUndefined();
    expect(f.saved.clients[0]!.revokedAt).toBeDefined();
    expect(f.readyEvents).toEqual([]);
    expect(f.gateway.snapshot().auditLog.some((entry) => entry.type === "enrolment.abandoned")).toBe(true);
    expect(f.provider).not.toHaveBeenCalled();
  });

  it("refreshes grant identity after awaited custody, without publishing ready while it waits", async () => {
    const f = harness();
    const entered = deferred<void>();
    const release = deferred<void>();
    f.custody.issued.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
    });
    const pending = await waiting(f.gateway);
    const approving = pending.approve();
    await entered.promise;
    expect(f.sessions.get(pending.sessionId)!.status).toBe("pairing_required");
    expect(f.readyEvents).toEqual([]);
    expect(ready(f.gateway, pending.sessionId)).toBeUndefined();
    f.provider.mockResolvedValue({ ...SUMMARY, user: { ...SUMMARY.user, displayName: "Current server name" } });
    release.resolve();
    await approving;
    expect(ready(f.gateway, pending.sessionId)!.user!.displayName).toBe("Current server name");
  });

  it("refreshes resume identity after custody and preserves previous-proof lost-reply recovery", async () => {
    const f = harness();
    const first = await pair(f.gateway);
    f.custody.presented.mockImplementationOnce(async () => {
      f.provider.mockResolvedValue({ ...SUMMARY, user: { ...SUMMARY.user, displayName: "Refreshed user" } });
    });
    const next = f.gateway.connect();
    await f.gateway.receive(next.sessionId, hello(first.token));
    expect(ready(f.gateway, next.sessionId)!.user!.displayName).toBe("Refreshed user");
    const retry = f.gateway.connect();
    await f.gateway.receive(retry.sessionId, hello(first.token));
    expect(ready(f.gateway, retry.sessionId)).toBeDefined();
    expect(f.gateway.snapshot().auditLog.some((entry) => entry.type === "credential.reuse_detected")).toBe(false);
    expect(f.saved.clients[0]!.revokedAt).toBeUndefined();
  });
});

const malformed = [
  ["null", null],
  ["invalid summary", { ...SUMMARY, user: { ...SUMMARY.user, email: "synthetic.private.bad-email" } }],
  ["different owner", { ...SUMMARY, user: { ...SUMMARY.user, userId: "user.other" } }],
  ["exception", new Error("synthetic.private.provider credential")],
  ["throwing summary getter", Object.defineProperty({}, "user", { get() { throw new Error("synthetic.private.getter"); } })]
] as const;

describe.each(malformed)("metadata refusal: %s", (_name, output) => {
  function refuse(f: ReturnType<typeof harness>) {
    if (output instanceof Error) f.provider.mockRejectedValue(output);
    else f.provider.mockResolvedValue(output as ClientGatewaySessionMetadata | null);
  }

  it("revokes only the fresh undelivered grant and publishes no ready state/frame/event", async () => {
    const f = harness();
    refuse(f);
    const pending = await waiting(f.gateway);
    const failure = await pending.approve().then(() => undefined, (error: unknown) => error);
    expect(failure).toMatchObject({ code: "client_gateway.session_metadata_unavailable" });
    expect((failure as Error).cause).toBeUndefined();
    expect(ready(f.gateway, pending.sessionId)).toBeUndefined();
    expect(f.sessions.get(pending.sessionId)!.status).not.toBe("ready");
    expect(f.readyEvents).toEqual([]);
    expect(f.saved.clients[0]!.revokedAt).toBeDefined();
    expect(f.custody.issued).not.toHaveBeenCalled();
    expect(JSON.stringify(f.gateway.outbound(pending.sessionId))).not.toContain("synthetic.private");
    expect(JSON.stringify(f.gateway.snapshot().auditLog)).not.toContain("synthetic.private");
  });

  it("refuses an established reconnect without changing its trust or falling back to pairing", async () => {
    const f = harness();
    const first = await pair(f.gateway);
    const before = structuredClone(f.saved.clients[0]);
    f.readyEvents.length = 0;
    f.custody.rotating.mockClear();
    refuse(f);
    const next = f.gateway.connect();
    await f.gateway.receive(next.sessionId, hello(first.token));
    expect(ready(f.gateway, next.sessionId)).toBeUndefined();
    expect(f.readyEvents).toEqual([]);
    expect(f.custody.rotating).not.toHaveBeenCalled();
    expect(f.saved.clients[0]).toEqual(before);
    expect(f.gateway.outbound(next.sessionId).some((message) => message.type === "server.pairing_required")).toBe(false);
    expect(f.gateway.snapshot().auditLog.some((entry) => entry.type === "credential.reuse_detected")).toBe(false);
    expect(JSON.stringify(f.gateway.outbound(next.sessionId))).not.toContain("synthetic.private");
  });
});
