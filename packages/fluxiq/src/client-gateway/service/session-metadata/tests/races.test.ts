import { describe, expect, it } from "vitest";
import { deferred, harness, hello, pair, ready, SUMMARY, waiting } from "./fixture.ts";

const DAY = 24 * 60 * 60_000;

async function blockedResume(final = false) {
  const f = harness();
  const first = await pair(f.gateway);
  f.readyEvents.length = 0;
  const entered = deferred<void>();
  const release = deferred<void>();
  let calls = 0;
  f.provider.mockImplementation(async () => {
    calls += 1;
    if (calls === (final ? 2 : 1)) {
      entered.resolve();
      await release.promise;
    }
    return structuredClone(SUMMARY);
  });
  const session = f.gateway.connect();
  const receiving = f.gateway.receive(session.sessionId, hello(first.token));
  await entered.promise;
  return { ...f, first, session, receiving, release };
}

describe("late authority changes while metadata waits", () => {
  it.each([false, true])("revocation during metadata final=%s publishes no ready frame/event", async (final) => {
    const f = await blockedResume(final);
    await f.gateway.revokeTrustedClient(f.saved.clients[0]!.trustedClientId, "actual revocation");
    f.release.resolve();
    await f.receiving;
    expect(ready(f.gateway, f.session.sessionId)).toBeUndefined();
    expect(f.readyEvents).toEqual([]);
    expect(f.saved.clients[0]!.revokedAt).toBeDefined();
  });

  it("a metadata callback can await actual revocation without a registry-lock deadlock", async () => {
    const f = harness();
    const first = await pair(f.gateway);
    f.provider.mockImplementationOnce(async ({ trustedClientId }) => {
      await f.gateway.revokeTrustedClient(trustedClientId, "removed membership");
      return structuredClone(SUMMARY);
    });
    const next = f.gateway.connect();
    await f.gateway.receive(next.sessionId, hello(first.token));
    expect(ready(f.gateway, next.sessionId)).toBeUndefined();
    expect(f.saved.clients[0]!.revokedAt).toBeDefined();
  });

  it.each(["session", "owner", "client", "type", "domain", "record", "token"] as const)("a changed %s cannot adopt the waiting metadata", async (kind) => {
    const f = await blockedResume(true);
    const client = f.registry.get(f.saved.clients[0]!.trustedClientId)!;
    if (kind === "session") f.gateway.disconnect(f.session.sessionId, "socket replaced");
    if (kind === "owner") client.approvedByUserId = "user.other";
    if (kind === "client") f.sessions.get(f.session.sessionId)!.clientId = "extension.other";
    if (kind === "type") client.clientType = "custom";
    if (kind === "domain") f.sessions.get(f.session.sessionId)!.metadata = { domainId: "other-domain" };
    if (kind === "record") {
      const original = f.registry.get.bind(f.registry);
      Object.defineProperty(f.registry, "get", { value: (id: string) => id === client.trustedClientId ? { ...client } : original(id) });
    }
    if (kind === "token") await f.registry.rotateToken(client, f.first.token);
    f.release.resolve();
    await f.receiving;
    expect(ready(f.gateway, f.session.sessionId)).toBeUndefined();
    expect(f.readyEvents).toEqual([]);
  });

  it.each([false, true])("a pending renew started during metadata final=%s cannot publish tentative expiry", async (final) => {
    const f = await blockedResume(final);
    const entered = deferred<void>();
    const persistence = deferred<void>();
    const before = f.saved.clients[0]!.expiresAt;
    f.saved.beforeSave = async () => {
      entered.resolve();
      await persistence.promise;
    };
    f.clock.now += 2 * DAY;
    const client = f.registry.get(f.saved.clients[0]!.trustedClientId)!;
    const renewal = f.registry.renew(client).then(() => "saved", () => "rolled back");
    await entered.promise;
    expect(client.expiresAt).not.toBe(before);
    f.release.resolve();
    await f.receiving;
    expect(ready(f.gateway, f.session.sessionId)).toBeUndefined();
    expect(f.readyEvents).toEqual([]);
    persistence.reject(new Error("synthetic failed pending renew"));
    expect(await renewal).toBe("rolled back");
    expect(f.saved.clients[0]!.expiresAt).toBe(before);
    expect(client.expiresAt).toBe(before);
    expect(client.revokedAt).toBeUndefined();
  });

  it("the final read barrier waits for a failed pending save before sending its rolled-back committed expiry", async () => {
    const f = harness();
    const first = await pair(f.gateway);
    const entered = deferred<void>();
    const persistence = deferred<void>();
    let renewal: Promise<string> | undefined;
    f.custody.presented.mockImplementationOnce(async () => {
      f.saved.beforeSave = async () => {
        entered.resolve();
        await persistence.promise;
      };
      f.clock.now += 2 * DAY;
      const client = f.registry.get(f.saved.clients[0]!.trustedClientId)!;
      renewal = f.registry.renew(client).then(() => "saved", () => "rolled back");
      await entered.promise;
    });
    const session = f.gateway.connect();
    const receiving = f.gateway.receive(session.sessionId, hello(first.token));
    await entered.promise;
    expect(ready(f.gateway, session.sessionId)).toBeUndefined();
    const durableExpiry = f.saved.clients[0]!.expiresAt;
    persistence.reject(new Error("synthetic failed pending save"));
    await receiving;
    expect(await renewal).toBe("rolled back");
    expect(ready(f.gateway, session.sessionId)!.credentialExpiresAt).toBe(durableExpiry);
    expect(ready(f.gateway, session.sessionId)!.credentialExpiresAt).toBe(f.saved.clients[0]!.expiresAt);
  });
});

describe("new grant cleanup and replacement semantics", () => {
  it("reports failed undelivered-trust cleanup safely without claiming persistence or readiness", async () => {
    const f = harness();
    f.provider.mockImplementationOnce(async () => {
      f.saved.beforeSave = async () => { throw new Error("synthetic.private.cleanup failure"); };
      return null;
    });
    const pending = await waiting(f.gateway);
    await expect(pending.approve()).rejects.toMatchObject({ code: "client_gateway.session_metadata_unavailable" });
    expect(ready(f.gateway, pending.sessionId)).toBeUndefined();
    expect(f.readyEvents).toEqual([]);
    expect(f.saved.clients[0]!.revokedAt).toBeUndefined();
    expect(f.gateway.snapshot().auditLog.some((entry) => entry.type === "trust.undelivered_cleanup_failed")).toBe(true);
    expect(JSON.stringify(f.gateway.snapshot().auditLog)).not.toContain("synthetic.private");
    expect(JSON.stringify(f.gateway.outbound(pending.sessionId))).not.toContain("synthetic.private");
  });

  it("an initially denied reapproval preserves the established trust", async () => {
    const f = harness();
    const first = await pair(f.gateway);
    const oldId = f.saved.clients[0]!.trustedClientId;
    f.provider.mockResolvedValue(null);
    const pending = await waiting(f.gateway);
    await expect(pending.approve()).rejects.toMatchObject({ code: "client_gateway.session_metadata_unavailable" });
    expect(f.gateway.snapshot().trustedClients.find((client) => client.trustedClientId === oldId)!.status).toBe("active");
    expect(f.sessions.get(first.sessionId)!.status).toBe("ready");
    expect(f.saved.clients.find((client) => client.trustedClientId !== oldId)!.revokedAt).toBeDefined();
    expect(ready(f.gateway, pending.sessionId)).toBeUndefined();
  });

  it("a late unavailable reapproval retires its fresh undelivered trust with no false proof-reuse claim", async () => {
    const f = harness();
    await pair(f.gateway);
    const oldId = f.saved.clients[0]!.trustedClientId;
    f.provider.mockResolvedValueOnce(structuredClone(SUMMARY)).mockResolvedValueOnce(null);
    const pending = await waiting(f.gateway);
    await expect(pending.approve()).rejects.toMatchObject({ code: "client_gateway.session_metadata_unavailable" });
    const old = f.saved.clients.find((client) => client.trustedClientId === oldId)!;
    const fresh = f.saved.clients.find((client) => client.trustedClientId !== oldId)!;
    expect(old.revocationReason).toBe("the same browser was approved again");
    expect(fresh.revocationReason).toBe("session metadata unavailable before credential delivery");
    expect(ready(f.gateway, pending.sessionId)).toBeUndefined();
    expect(f.custody.forgotten).toHaveBeenCalledWith(fresh.trustedClientId);
    expect(f.gateway.snapshot().auditLog.some((entry) => entry.type === "credential.reuse_detected")).toBe(false);
  });

  it("a disconnected grant during awaited custody leaves no new ready state or active grant", async () => {
    const f = harness();
    const entered = deferred<void>();
    const release = deferred<void>();
    f.custody.issued.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
    const pending = await waiting(f.gateway);
    const approving = pending.approve();
    const result = approving.then(() => "approved", () => "refused");
    await entered.promise;
    f.gateway.disconnect(pending.sessionId, "socket left");
    release.resolve();
    expect(await result).toBe("refused");
    expect(ready(f.gateway, pending.sessionId)).toBeUndefined();
    expect(f.readyEvents).toEqual([]);
    expect(f.saved.clients[0]!.revokedAt).toBeDefined();
  });

  it("late metadata failure on an established resume keeps the prior credential recoverable", async () => {
    const f = harness();
    const first = await pair(f.gateway);
    f.provider.mockResolvedValueOnce(structuredClone(SUMMARY)).mockResolvedValueOnce(null);
    const refused = f.gateway.connect();
    await f.gateway.receive(refused.sessionId, hello(first.token));
    expect(ready(f.gateway, refused.sessionId)).toBeUndefined();
    expect(f.saved.clients[0]!.revokedAt).toBeUndefined();
    f.provider.mockResolvedValue(structuredClone(SUMMARY));
    const recovered = f.gateway.connect();
    await f.gateway.receive(recovered.sessionId, hello(first.token));
    expect(ready(f.gateway, recovered.sessionId)).toBeDefined();
    expect(f.gateway.snapshot().auditLog.some((entry) => entry.type === "credential.reuse_detected")).toBe(false);
  });
});
