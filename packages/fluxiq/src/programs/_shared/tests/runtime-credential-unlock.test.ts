// @fluxiq-test-group real-sql
// Real Identity Access, gateway, current use authority and Secret Keys on isolated
// disk stores. Passwords and provider values below are synthetic. No provider calls.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RuntimeAccessFixture, RUNTIME_KEY_VALUE, RUNTIME_PASSWORD, runtimeClientMessage,
  type RuntimeClientPrincipal
} from "./runtime-access-fixture.ts";

let fixture: RuntimeAccessFixture;
beforeEach(async () => {
  vi.stubEnv("FLUXIQ_PROFILE", "local");
  vi.stubEnv("FLUXIQ_SECRET_KEYS_KEYRING_FILE", "");
  fixture = await RuntimeAccessFixture.create();
});
afterEach(async () => {
  try { await fixture.dispose(); } finally { vi.unstubAllEnvs(); }
});

async function paired() {
  const runtime = fixture.boot();
  const login = await fixture.signIn(runtime);
  const key = await fixture.createKey(runtime, login);
  const client = await fixture.pair(runtime, login);
  const principal = await fixture.principal(runtime, client, login.user.id);
  return { runtime, login, key, client, principal };
}

async function person() {
  const runtime = fixture.boot();
  await fixture.signIn(runtime);
  const password = "dummy-person-password";
  await runtime.identityAccess.upsertUser({ id: "user.person", username: "person", displayName: "Person", roleId: "admin", password });
  const login = await fixture.signIn(runtime, "person", password);
  const key = await fixture.createKey(runtime, login, password);
  const client = await fixture.pair(runtime, login);
  const principal = await fixture.principal(runtime, client, login.user.id);
  return { runtime, login, key, client, principal };
}

describe("independent authenticated-client model access through the real runtime", () => {
  it("uses an approved client's configured key immediately without a second password", async () => {
    const { runtime, login, key, client, principal } = await paired();
    const caller = runtime.automationStudio.conversations.callerFor({ userId: login.user.id, sessionId: `client-gateway:${client.gatewaySessionId}` });
    expect(caller).toMatchObject({ paired: true, sessionId: `client-gateway:${client.gatewaySessionId}` });
    const authorization = await runtime.secretKeys.access.createUseAuthorization({ id: key.id, principal });
    expect(authorization.remainingUses).toBe(1);
    expect((await runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id })).value).toBe(RUNTIME_KEY_VALUE);
    await expect(runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id })).rejects.toThrow();
  }, 120_000);

  it("keeps an approved client usable after panel logout while refusing that panel principal", async () => {
    const { runtime, login, key, client, principal } = await paired();
    const clientUse = await runtime.secretKeys.access.createUseAuthorization({ id: key.id, principal });
    const panelPrincipal = { kind: "session" as const, userId: login.user.id, sessionId: login.session.id };
    const panelUse = await runtime.secretKeys.access.createUseAuthorization({ id: key.id, principal: panelPrincipal });
    await runtime.identityAccess.revokeSession(login.session.id);
    await expect(runtime.identityAccess.validateSession(login.session.id)).resolves.toBeNull();
    expect((await runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: clientUse.authorizationId, id: key.id })).value).toBe(RUNTIME_KEY_VALUE);
    await expect(runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: panelUse.authorizationId, id: key.id })).rejects.toThrow();
    await expect(fixture.reveal(runtime, panelPrincipal, key.id)).rejects.toThrow();
    expect(await fixture.reveal(runtime, await fixture.principal(runtime, client, login.user.id), key.id)).toBe(RUNTIME_KEY_VALUE);
  }, 120_000);

  it("reopens host custody after logout and restart without another panel sign-in", async () => {
    const { runtime, login, key, client } = await paired();
    await runtime.identityAccess.revokeSession(login.session.id);
    await fixture.close(runtime);
    const restarted = fixture.boot();
    const connected = await fixture.reconnect(restarted, client.token);
    const principal = await fixture.principal(restarted, connected, login.user.id);
    await expect(restarted.identityAccess.validateSession(login.session.id)).resolves.toBeNull();
    expect(restarted.secretKeys.unlockedSessionFor(login.user.id)).toBeNull();
    expect(await fixture.reveal(restarted, principal, key.id)).toBe(RUNTIME_KEY_VALUE);
  }, 120_000);

  it("automatically uses a key configured after an empty-key approval and restart", async () => {
    const runtime = fixture.boot();
    const login = await fixture.signIn(runtime);
    const client = await fixture.pair(runtime, login);
    await fixture.principal(runtime, client, login.user.id);
    expect((await runtime.secretKeys.snapshot()).keys).toEqual([]);
    await runtime.identityAccess.revokeSession(login.session.id);
    await fixture.close(runtime);
    const restarted = fixture.boot();
    const connected = await fixture.reconnect(restarted, client.token);
    const principal = await fixture.principal(restarted, connected, login.user.id);
    const configuring = await fixture.signIn(restarted);
    const key = await fixture.createKey(restarted, configuring);
    await restarted.identityAccess.revokeSession(configuring.session.id);
    expect(await fixture.reveal(restarted, principal, key.id)).toBe(RUNTIME_KEY_VALUE);
  }, 120_000);

  it("keeps working through credential rotation on repeated reconnects", async () => {
    const { runtime, login, key, client } = await paired();
    const second = await fixture.reconnect(runtime, client.token);
    const third = await fixture.reconnect(runtime, second.token);
    expect(third.token === second.token).toBe(false);
    expect(await fixture.reveal(runtime, await fixture.principal(runtime, third, login.user.id), key.id)).toBe(RUNTIME_KEY_VALUE);
  }, 120_000);

  it("recovers a lost credential reply, then revokes real trust on obsolete credential reuse", async () => {
    const original = await paired();
    let runtime = original.runtime;
    const lost = await fixture.reconnect(runtime, original.client.token);
    expect(lost.token === original.client.token).toBe(false);
    runtime.clientGateway.disconnect(lost.gatewaySessionId, "socket closed");
    await fixture.close(runtime);
    runtime = fixture.boot();
    const recovered = await fixture.reconnect(runtime, original.client.token);
    const principal = await fixture.principal(runtime, recovered, original.login.user.id);
    expect(await fixture.reveal(runtime, principal, original.key.id)).toBe(RUNTIME_KEY_VALUE);
    await runtime.clientGateway.receive(recovered.gatewaySessionId, runtimeClientMessage("client.credential_received", {}));
    await expect(runtime.clientGateway.authorizeToken(original.client.token)).resolves.toBeNull();
    await expect(runtime.clientGateway.authorizeToken(lost.token)).resolves.toBeNull();
    await fixture.close(runtime);
    runtime = fixture.boot();
    const newest = await fixture.reconnect(runtime, recovered.token);
    const currentPrincipal = await fixture.principal(runtime, newest, original.login.user.id);
    expect(await fixture.reveal(runtime, currentPrincipal, original.key.id)).toBe(RUNTIME_KEY_VALUE);
    const pending = await runtime.secretKeys.access.createUseAuthorization({ id: original.key.id, principal: currentPrincipal });
    const replay = runtime.clientGateway.connect();
    await runtime.clientGateway.receive(replay.sessionId, runtimeClientMessage("client.hello", { clientId: "extension.runtime", clientType: "extension", name: "Chrome", token: original.client.token }));
    expect(runtime.clientGateway.snapshot().sessions.find(session => session.sessionId === replay.sessionId)?.status).toBe("pairing_required");
    await expect(fixture.reveal(runtime, currentPrincipal, original.key.id)).rejects.toThrow();
    await expect(runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: pending.authorizationId, id: original.key.id })).rejects.toThrow();
    await expect(runtime.clientGateway.authorizeToken(newest.token)).resolves.toBeNull();
  }, 120_000);

  it.each(["forget", "revoke"] as const)("refuses both fresh and already-minted use after actual client %s", async action => {
    const { runtime, key, client, principal } = await paired();
    const pending = await runtime.secretKeys.access.createUseAuthorization({ id: key.id, principal });
    if (action === "forget") await runtime.clientGateway.receive(client.gatewaySessionId, runtimeClientMessage("client.forget_pairing", {}));
    else await runtime.clientGateway.revokeTrustedClient(principal.trustedClientId);
    await expect(runtime.clientGateway.authorizeToken(client.token)).resolves.toBeNull();
    await expect(fixture.reveal(runtime, principal, key.id)).rejects.toThrow();
    await expect(runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: pending.authorizationId, id: key.id })).rejects.toThrow();
  }, 120_000);

  it.each(["disabled", "permissions"] as const)("rechecks current account %s at mint and consume, including after restart", async change => {
    const { runtime, key, login, principal } = await person();
    expect(await fixture.reveal(runtime, principal, key.id)).toBe(RUNTIME_KEY_VALUE);
    const pending = await runtime.secretKeys.access.createUseAuthorization({ id: key.id, principal });
    await runtime.identityAccess.updateUser(change === "disabled" ? { id: login.user.id, enabled: false } : { id: login.user.id, roleId: "viewer" });
    await expect(fixture.reveal(runtime, principal, key.id)).rejects.toThrow();
    await expect(runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: pending.authorizationId, id: key.id })).rejects.toThrow();
    await fixture.close(runtime);
    await expect(fixture.reveal(fixture.boot(), principal, key.id)).rejects.toThrow();
  }, 120_000);

  it("does not accept invented clients, another user, or another owner's key", async () => {
    const { runtime, key, principal } = await paired();
    const missing: RuntimeClientPrincipal = { ...principal, trustedClientId: "trusted.missing" };
    await expect(fixture.reveal(runtime, missing, key.id)).rejects.toThrow();
    await expect(fixture.reveal(runtime, { ...principal, userId: "user.someone-else" }, key.id)).rejects.toThrow();
    const password = "dummy-other-owner-password";
    await runtime.identityAccess.upsertUser({ id: "user.other", username: "other", displayName: "Other", roleId: "admin", password });
    const other = await fixture.signIn(runtime, "other", password);
    const foreign = await fixture.createKey(runtime, other, password);
    await expect(fixture.reveal(runtime, principal, foreign.id)).rejects.toThrow();
  }, 120_000);

  it("stores neither provider values nor credentials in plaintext and removes forgotten holder rows", async () => {
    const { runtime, key, client, principal } = await paired();
    expect(await fixture.reveal(runtime, principal, key.id)).toBe(RUNTIME_KEY_VALUE);
    expect(await fixture.checkpoint()).toBeGreaterThan(0);
    expect((await fixture.databasesHolding(RUNTIME_KEY_VALUE)).length).toBe(0);
    expect((await fixture.databasesHolding(client.token)).length).toBe(0);
    const holder = `paired-client:${principal.trustedClientId}`;
    expect((await fixture.databasesHolding(holder)).length).toBeGreaterThan(0);
    await runtime.clientGateway.receive(client.gatewaySessionId, runtimeClientMessage("client.forget_pairing", {}));
    await expect(runtime.clientGateway.authorizeToken(client.token)).resolves.toBeNull();
    await fixture.checkpoint();
    expect(await fixture.databasesHolding(holder)).toEqual([]);
  }, 120_000);

  it("does not recreate a deleted account over a stored credential through the real endpoints", async () => {
    const runtime = fixture.boot();
    const admin = await fixture.signIn(runtime);
    const actor = { sessionId: admin.session.id, userId: admin.user.id, roleId: admin.role.id, permissions: [...admin.role.permissions, "data.manage" as const] };
    const proof = { authSessionId: admin.session.id, authorizationPassword: RUNTIME_PASSWORD };
    await runtime.identityAccess.upsertUser({ id: "user.person", username: "person", displayName: "Person", roleId: "admin", password: "dummy-person-password" });
    const removed = await runtime.api.call({ programId: "database-manager", endpoint: "delete-record", scope: {}, actor, payload: { kind: "identity.users", id: "user:user.person", ...proof } });
    expect(removed.ok, removed.error).toBe(true);
    await runtime.identityAccess.revokeUserSessions("user.person");
    await expect(runtime.api.call({ programId: "identity-access", endpoint: "create-user", scope: {}, actor, payload: { id: "user.person", username: "person", displayName: "Person", roleId: "admin", password: "dummy-chosen-password", ...proof } })).resolves.toMatchObject({ ok: false, error: expect.stringContaining("stored credential") });
    await expect(runtime.identityAccess.authenticate({ username: "person", password: "dummy-chosen-password" })).rejects.toThrow();
  }, 120_000);
});
