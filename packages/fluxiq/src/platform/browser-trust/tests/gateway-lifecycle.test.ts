// @fluxiq-test-group real-sql
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { browserTrustFixture } from "./browser-trust-fixture.ts";
import { gatewaySession } from "./gateway-session.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("gateway lifecycle through authoritative platform browser trust", () => {
  it("grants, rotates, confirms, restarts and revokes the same workspace binding through independent lookup", async () => {
    const f = await browserTrustFixture(cleanups);
    const lookup = f.openRepository();
    const gateway = f.createGateway("workspace.first");
    const client = gatewaySession(gateway);
    const first = await client.pair();
    const initial = await lookup.lookupCredential(first.token);
    expect(initial).toMatchObject({ status: "current", binding: { workspaceId: "workspace.first", clientId: "extension.same-client-id", approvedByUserId: "user.synthetic", domainId: "synthetic-domain" } });
    expect(JSON.stringify(initial)).not.toMatch(/tokenHash|reuseKey|previousTokenHash/u);
    gateway.disconnect(first.sessionId, "synthetic socket closed");
    const second = await client.hello(first.token);
    expect(second.status).toBe("ready");
    expect(await lookup.lookupCredential(first.token)).toMatchObject({ status: "previous", binding: { workspaceId: "workspace.first" } });
    expect(await lookup.lookupCredential(second.token!)).toMatchObject({ status: "current", binding: { workspaceId: "workspace.first" } });
    await client.confirm(second.sessionId);
    expect(await lookup.lookupCredential(first.token)).toMatchObject({ status: "obsolete", reuse: "revoke" });
    expect(await lookup.lookupCredential(first.token, { request: true })).toMatchObject({ status: "obsolete", reuse: "request-in-flight" });
    const forged = `${first.token.split(".")[0]}.forged.secret`;
    expect(await lookup.lookupCredential(forged)).toEqual({ status: "invalid", reason: "forged" });
    gateway.disconnect(second.sessionId, "synthetic restart");
    const restarted = f.createGateway("workspace.first", f.openRepository().scopedStore("workspace.first"));
    const resumed = await gatewaySession(restarted).hello(second.token);
    expect(resumed.status).toBe("ready");
    const trustId = restarted.snapshot().trustedClients[0]!.trustedClientId;
    await restarted.revokeTrustedClient(trustId, "synthetic operator revoke");
    expect(await lookup.lookupCredential(resumed.token!)).toMatchObject({ status: "inactive", reason: "revoked", binding: { workspaceId: "workspace.first", trustedClientId: trustId } });
    const reopened = f.openRepository();
    expect(await reopened.lookupCredential(resumed.token!)).toMatchObject({ status: "inactive", reason: "revoked" });
    expect((await gatewaySession(f.createGateway("workspace.first", reopened.scopedStore("workspace.first"))).hello(resumed.token)).status).toBe("pairing_required");
    const bytes = await readFile(f.filePath);
    for (const token of [first.token, second.token!, resumed.token!]) expect(bytes.includes(Buffer.from(token))).toBe(false);
  });

  it("keeps equal client ids in two workspaces isolated while either one rotates or revokes", async () => {
    const f = await browserTrustFixture(cleanups);
    const first = f.createGateway("workspace.first");
    const second = f.createGateway("workspace.second");
    const a = await gatewaySession(first).pair();
    const b = await gatewaySession(second).pair();
    const lookup = f.openRepository();
    expect(await lookup.lookupCredential(a.token)).toMatchObject({ status: "current", binding: { workspaceId: "workspace.first" } });
    expect(await lookup.lookupCredential(b.token)).toMatchObject({ status: "current", binding: { workspaceId: "workspace.second" } });
    first.disconnect(a.sessionId, "synthetic reconnect");
    const rotated = await gatewaySession(first).hello(a.token);
    expect(rotated.status).toBe("ready");
    await first.revokeTrustedClient(first.snapshot().trustedClients[0]!.trustedClientId);
    expect(await lookup.lookupCredential(rotated.token!)).toMatchObject({ status: "inactive", reason: "revoked" });
    expect(await lookup.lookupCredential(b.token)).toMatchObject({ status: "current", binding: { workspaceId: "workspace.second" } });
    expect(await second.authorizeToken(b.token)).not.toBeNull();
    expect(await first.authorizeToken(b.token)).toBeNull();
  });

  it("retains signed obsolete-credential reuse detection and durable revocation in the gateway", async () => {
    const f = await browserTrustFixture(cleanups);
    const gateway = f.createGateway("workspace.first");
    const client = gatewaySession(gateway);
    const first = await client.pair();
    gateway.disconnect(first.sessionId, "synthetic reconnect");
    const rotated = await client.hello(first.token);
    await client.confirm(rotated.sessionId);
    expect(await f.openRepository().lookupCredential(first.token)).toMatchObject({ status: "obsolete", reuse: "revoke" });
    expect((await client.hello(first.token)).status).toBe("pairing_required");
    expect(await f.openRepository().lookupCredential(rotated.token!)).toMatchObject({ status: "inactive", reason: "revoked" });
  });

  it("does not publish or retain a new trust when mandatory grant persistence fails", async () => {
    const f = await browserTrustFixture(cleanups);
    const initialization = f.repository.scopedStore("workspace.initialize-schema");
    await initialization.load();
    await initialization.save([]);
    const gateway = f.createGateway("workspace.first");
    await gateway.ready();
    await f.executeSql("create trigger refuse_trust before insert on browser_trust_records begin select raise(abort, 'synthetic persistence rejection'); end;");
    const session = await gatewaySession(gateway).hello();
    const pairing = gateway.snapshot().pairings[0]!;
    await expect(gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "user.synthetic" })).rejects.toThrow("synthetic persistence rejection");
    expect(gateway.snapshot().trustedClients).toEqual([]);
    expect(gateway.outbound(session.sessionId).some((entry) => entry.type === "server.session_ready")).toBe(false);
    expect(await f.openRepository().scopedStore("workspace.first").load()).toEqual([]);
    await f.executeSql("drop trigger refuse_trust;");
    const paired = await gatewaySession(gateway, "extension.after-failure").pair();
    expect(await f.openRepository().lookupCredential(paired.token)).toMatchObject({ status: "current" });
  });

  it("rolls failed rotation and its generation back without publishing a route-invalid replacement", async () => {
    const f = await browserTrustFixture(cleanups);
    const gateway = f.createGateway("workspace.first");
    const client = gatewaySession(gateway);
    const paired = await client.pair();
    gateway.disconnect(paired.sessionId, "synthetic reconnect");
    await f.executeSql("create trigger refuse_rotation before update on browser_trust_records begin select raise(abort, 'synthetic rotation rejection'); end;");
    await expect(client.hello(paired.token)).rejects.toThrow("synthetic rotation rejection");
    const session = gateway.snapshot().sessions.at(-1)!;
    expect(gateway.outbound(session.sessionId).some((entry) => entry.type === "server.session_ready")).toBe(false);
    expect(await f.openRepository().lookupCredential(paired.token)).toMatchObject({ status: "current" });
    await f.executeSql("drop trigger refuse_rotation;");
    const resumed = await client.hello(paired.token);
    expect(resumed.status).toBe("ready");
    expect(await f.openRepository().lookupCredential(resumed.token!)).toMatchObject({ status: "current" });
  });

  it("rejects a stale gateway grant instead of publishing an unrouteable credential", async () => {
    const f = await browserTrustFixture(cleanups);
    const current = f.createGateway("workspace.first");
    const stale = f.createGateway("workspace.first", f.openRepository().scopedStore("workspace.first"));
    await Promise.all([current.ready(), stale.ready()]);
    const accepted = await gatewaySession(current).pair();
    const waiting = await gatewaySession(stale, "extension.stale").hello();
    const code = stale.snapshot().pairings[0]!.pairingCode;
    await expect(stale.approvePairing(code, { approvedByUserId: "user.synthetic" })).rejects.toMatchObject({ code: "browser_trust.conflict", reason: "stale-generation" });
    expect(stale.snapshot().trustedClients).toEqual([]);
    expect(stale.outbound(waiting.sessionId).some((entry) => entry.type === "server.session_ready")).toBe(false);
    expect(await f.openRepository().lookupCredential(accepted.token)).toMatchObject({ status: "current" });
  });
});
