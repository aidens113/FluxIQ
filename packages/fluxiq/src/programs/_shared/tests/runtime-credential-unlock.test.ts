// @fluxiq-test-group real-sql
// Through the real wiring: Identity Access, the Client Gateway and Secret Keys
// over stores on disk. A person pairs a browser, Core restarts, and the browser's
// next message brings the key back with no password. Each lock event then stays
// locked across a restart. At the production derivation cost. "admin" is the
// bootstrap administrator's default password; every other secret is a dummy.

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage } from "../../../client-gateway/index.ts";
import type { FluxIQHostPaths } from "../../../framework/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../index.ts";
import { secretKeyPairedHolderId } from "../../secret-keys/index.ts";

const PASSWORD = "admin";
const KEY_VALUE = "dummy-provider-key-value-for-runtime";
const CLIENT_ID = "extension.runtime";

function clientMessage<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

function pathsAt(root: string): FluxIQHostPaths {
  const fluxiq = path.join(root, ".fluxiq");
  return {
    root, fluxiq, config: path.join(fluxiq, "config.json"), data: path.join(fluxiq, "data"), databases: path.join(fluxiq, "databases"),
    inputs: path.join(fluxiq, "inputs"), outputs: path.join(fluxiq, "outputs"), streams: path.join(fluxiq, "streams"), domains: path.join(fluxiq, "domains"),
    domainPrograms: path.join(fluxiq, "domain-programs"), domainInputs: path.join(fluxiq, "domain-inputs"), domainOutputs: path.join(fluxiq, "domain-outputs")
  } as FluxIQHostPaths;
}

async function sqliteFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sqlite")).map((entry) => path.join(entry.parentPath, entry.name));
}

/** Moves what the write-ahead log holds into the database files, where a deleted row's bytes would linger. */
async function checkpointAll(root: string): Promise<void> {
  for (const file of await sqliteFiles(root)) {
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite3.Database(path.toNamespacedPath(file));
      db.exec("pragma wal_checkpoint(FULL)", (error) => db.close((closeError) => (error || closeError ? reject(error ?? closeError) : resolve())));
    });
  }
}

async function sqliteFilesHolding(root: string, text: string): Promise<string[]> {
  const holding: string[] = [];
  for (const file of await sqliteFiles(root)) if ((await readFile(file)).includes(text)) holding.push(file);
  return holding;
}

function boot(paths: FluxIQHostPaths): GlobalProgramRuntime {
  return createGlobalProgramRuntime(paths, { modelProvidersEnabled: false });
}

function shutDown(runtime: GlobalProgramRuntime): void {
  runtime.secretKeys.close();
  runtime.detach();
}

/** Signs in with the password, as the login route does. */
async function signIn(runtime: GlobalProgramRuntime) {
  const login = await runtime.identityAccess.authenticate({ username: "admin", password: PASSWORD });
  await runtime.secretKeys.unlockSession({ sessionId: login.session.id, userId: login.user.id, authorizationPassword: PASSWORD, expiresAtMs: login.session.expiresAtMs });
  return login;
}

/** A browser asks to pair and the signed-in person approves it; the browser receives its credential. */
async function pair(runtime: GlobalProgramRuntime, approver: { userId: string; sessionId: string; expiresAtMs: number }, options: { proved?: boolean } = {}): Promise<{ gatewaySessionId: string; token: string; holderId: string }> {
  const session = runtime.clientGateway.connect();
  await runtime.clientGateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome" }));
  const pairingCode = runtime.clientGateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "";
  await runtime.clientGateway.approvePairing(pairingCode, { approvedByUserId: approver.userId, approvedBySessionId: approver.sessionId });
  const trustedClientId = runtime.clientGateway.snapshot().trustedClients.find((client) => client.clientId === CLIENT_ID)?.trustedClientId ?? "";
  const holderId = secretKeyPairedHolderId(trustedClientId);
  // What the approve route does when the person gives their password in the pairing dialog.
  if (options.proved !== false) await runtime.secretKeys.unlockSession({ sessionId: approver.sessionId, userId: approver.userId, authorizationPassword: PASSWORD, expiresAtMs: approver.expiresAtMs, unlockClients: [holderId], passwordVerified: true });
  return { gatewaySessionId: session.sessionId, token: tokenFrom(runtime, session.sessionId), holderId };
}

function tokenFrom(runtime: GlobalProgramRuntime, sessionId: string): string {
  const ready = runtime.clientGateway.outbound(sessionId).filter((message) => message.type === "server.session_ready").at(-1);
  const token = (ready?.payload as { token?: string } | undefined)?.token;
  if (!token) throw new Error("no credential was sent to the browser");
  return token;
}

/** The browser reconnects with its credential, and receives the next one. */
async function reconnect(runtime: GlobalProgramRuntime, token: string): Promise<{ gatewaySessionId: string; token: string }> {
  const session = runtime.clientGateway.connect();
  await runtime.clientGateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token }));
  return { gatewaySessionId: session.sessionId, token: tokenFrom(runtime, session.sessionId) };
}

/** Whether a message from this browser could pay for a model call now, as the chat's own caller mapping decides. */
async function keyReleasedTo(runtime: GlobalProgramRuntime, gatewaySessionId: string, userId: string, keyId: string): Promise<string | null> {
  const caller = runtime.automationStudio.conversations.callerFor({ userId, sessionId: `client-gateway:${gatewaySessionId}` });
  if (caller.keyLocked) return null;
  try {
    const authorization = await runtime.secretKeys.createSessionRevealAuthorization({ id: keyId, sessionId: caller.sessionId, userId, ttlMs: 10_000 });
    return (await runtime.secretKeys.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: keyId })).value;
  } catch {
    return null;
  }
}

describe("a person's model key across a Core restart, through the real wiring", () => {
  let root = "";
  beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-credential-unlock-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  async function pairedThenRestarted() {
    const paths = pathsAt(root);
    const first = boot(paths);
    const login = await signIn(first);
    const key = await first.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: login.user.id, actorSession: { sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs } });
    const paired = await pair(first, { userId: login.user.id, sessionId: login.session.id, expiresAtMs: login.session.expiresAtMs });
    expect(await keyReleasedTo(first, paired.gatewaySessionId, login.user.id, key.id)).toBe(KEY_VALUE);
    shutDown(first);
    const runtime = boot(paths);
    return { paths, runtime, login, keyId: key.id, paired };
  }

  it("comes back from the browser's own credential, with no password", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      const again = await reconnect(runtime, paired.token);
      expect(await keyReleasedTo(runtime, again.gatewaySessionId, login.user.id, keyId)).toBe(KEY_VALUE);
      // The panel session comes back from its cookie too.
      await runtime.secretKeys.credentialUnlocks.presentPanelSession({ sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs });
      expect(runtime.secretKeys.unlockedSessionFor(login.user.id)).toBe(login.session.id);
    } finally {
      shutDown(runtime);
    }
  });

  it("keeps working through a chain of reconnects, each rotating the credential", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      const second = await reconnect(runtime, paired.token);
      const third = await reconnect(runtime, second.token);
      expect(third.token).not.toBe(second.token);
      expect(await keyReleasedTo(runtime, third.gatewaySessionId, login.user.id, keyId)).toBe(KEY_VALUE);
    } finally {
      shutDown(runtime);
    }
  });

  it("survives a reply that never arrived: the old credential still brings the key back, until the new one is confirmed", async () => {
    const { paths, runtime, login, keyId, paired } = await pairedThenRestarted();
    let current = runtime;
    try {
      // The socket dropped as the new credential was sent, so the browser still holds the old one.
      const lost = await reconnect(current, paired.token);
      expect(lost.token).not.toBe(paired.token);
      current.clientGateway.disconnect(lost.gatewaySessionId, "socket closed");
      shutDown(current);
      current = boot(paths);
      const again = await reconnect(current, paired.token);
      expect(await keyReleasedTo(current, again.gatewaySessionId, login.user.id, keyId)).toBe(KEY_VALUE);
      // The browser says it stored the newest: the old one and the lost one both end.
      await current.clientGateway.receive(again.gatewaySessionId, clientMessage("client.credential_received", {}));
      await expect(current.clientGateway.authorizeToken(paired.token)).resolves.toBeNull();
      await expect(current.clientGateway.authorizeToken(lost.token)).resolves.toBeNull();
      // The newest still opens it, after another restart, and the old one's wrap is gone: even with the store, it opens nothing.
      const trustedClientId = current.clientGateway.snapshot().trustedClients.find((client) => client.clientId === CLIENT_ID)?.trustedClientId ?? "";
      shutDown(current);
      current = boot(paths);
      const holder = { holderKind: "paired-client" as const, holderId: `paired-client:${trustedClientId}`, userId: login.user.id, expiresAtMs: Date.now() + 60_000 };
      await expect(current.secretKeys.credentialUnlocks.presentCredential(holder, paired.token)).resolves.toEqual({ unlockedKeyCount: 0 });
      const newest = await reconnect(current, again.token);
      expect(await keyReleasedTo(current, newest.gatewaySessionId, login.user.id, keyId)).toBe(KEY_VALUE);
      // One it has moved on from, said in a hello, can only be a copy: it ends the trust, and the key with it.
      const replay = current.clientGateway.connect();
      await current.clientGateway.receive(replay.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token: paired.token }));
      expect(current.clientGateway.snapshot().sessions.find((session) => session.sessionId === replay.sessionId)?.status).toBe("pairing_required");
      expect(await keyReleasedTo(current, newest.gatewaySessionId, login.user.id, keyId)).toBeNull();
    } finally {
      shutDown(current);
    }
  });

  it("stays locked after signing out of the session that approved it, across a restart", async () => {
    const { paths, runtime, login, keyId, paired } = await pairedThenRestarted();
    await runtime.identityAccess.revokeSession(login.session.id);
    shutDown(runtime);
    const again = boot(paths);
    try {
      const connected = await reconnect(again, paired.token);
      expect(await keyReleasedTo(again, connected.gatewaySessionId, login.user.id, keyId)).toBeNull();
    } finally {
      shutDown(again);
    }
  });

  it("locks on an administrator's revoke by digest, whose raw id this process never saw", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      const connected = await reconnect(runtime, paired.token);
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBe(KEY_VALUE);
      const digest = (await runtime.identityAccess.snapshot()).sessions.find((session) => session.userId === login.user.id)?.id ?? "";
      await runtime.identityAccess.revokeSession({ digest }, { userId: "user.other-admin", administrator: true });
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBeNull();
    } finally {
      shutDown(runtime);
    }
  });

  it("locks when every session of the person is revoked", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      const connected = await reconnect(runtime, paired.token);
      await runtime.identityAccess.revokeUserSessions(login.user.id);
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBeNull();
    } finally {
      shutDown(runtime);
    }
  });

  it("locks every browser of a person whose sessions all end, even with no session left to name", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      await runtime.identityAccess.revokeSession(login.session.id);
      const connected = await reconnect(runtime, paired.token);
      // Unlocked by the person, under no session Identity Access knows, so ending every session names none of them.
      await runtime.secretKeys.unlockSession({ sessionId: "session.outside-identity", userId: login.user.id, authorizationPassword: PASSWORD, expiresAtMs: Date.now() + 60_000, unlockClients: [paired.holderId] });
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBe(KEY_VALUE);
      await runtime.identityAccess.revokeUserSessions(login.user.id);
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBeNull();
    } finally {
      shutDown(runtime);
    }
  });

  it("a lock holds for that browser while the person is signed in elsewhere", async () => {
    const { runtime, login, paired } = await pairedThenRestarted();
    try {
      const connected = await reconnect(runtime, paired.token);
      const elsewhere = await signIn(runtime);
      await runtime.identityAccess.revokeSession(login.session.id);
      expect(runtime.secretKeys.unlockedSessionFor(login.user.id)).toBe(elsewhere.session.id);
      // A message from the browser, and a call already running under its own unlock, reach neither the other session's unlock nor its key.
      const paired_ = runtime.automationStudio.conversations.callerFor({ userId: login.user.id, sessionId: `client-gateway:${connected.gatewaySessionId}` });
      expect(paired_).toMatchObject({ keyLocked: true, keyNeedsUnlock: true, preferredSessionId: null });
      const trusted = runtime.clientGateway.snapshot().trustedClients.find((client) => client.clientId === CLIENT_ID);
      const running = runtime.automationStudio.conversations.callerFor({ userId: login.user.id, sessionId: `paired-client:${trusted?.trustedClientId ?? ""}` });
      expect(running.keyNeedsUnlock).toBe(true);
    } finally {
      shutDown(runtime);
    }
  });

  it("locks when the pairing is forgotten from the browser, and its credential then speaks for nobody", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      const connected = await reconnect(runtime, paired.token);
      await runtime.clientGateway.receive(connected.gatewaySessionId, clientMessage("client.forget_pairing", {}));
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBeNull();
      await expect(runtime.clientGateway.authorizeToken(connected.token)).resolves.toBeNull();
    } finally {
      shutDown(runtime);
    }
  });

  it("locks when an administrator revokes the browser's trust", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      const connected = await reconnect(runtime, paired.token);
      const trusted = runtime.clientGateway.snapshot().trustedClients.find((client) => client.clientId === CLIENT_ID);
      await runtime.clientGateway.revokeTrustedClient(trusted?.trustedClientId ?? "");
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBeNull();
    } finally {
      shutDown(runtime);
    }
  });

  it("locks on a password reset nobody proved the old password for", async () => {
    const { runtime, login, keyId, paired } = await pairedThenRestarted();
    try {
      const connected = await reconnect(runtime, paired.token);
      await runtime.identityAccess.resetPassword(login.user.id, "dummy-new-password-0002");
      expect(await keyReleasedTo(runtime, connected.gatewaySessionId, login.user.id, keyId)).toBeNull();
    } finally {
      shutDown(runtime);
    }
  });

  it("locks when an administrator disables the person, and stays locked across a restart", async () => {
    const paths = pathsAt(root);
    const first = boot(paths);
    const admin = await signIn(first);
    const person = await first.identityAccess.upsertUser({ id: "user.person", username: "person", displayName: "Person", password: "dummy-person-password", roleId: "admin" });
    const login = await first.identityAccess.authenticate({ username: "person", password: "dummy-person-password" });
    await first.secretKeys.unlockSession({ sessionId: login.session.id, userId: person.id, authorizationPassword: "dummy-person-password", expiresAtMs: login.session.expiresAtMs });
    const key = await first.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: "dummy-person-password", createdBy: person.id, actorSession: { sessionId: login.session.id, userId: person.id, expiresAtMs: login.session.expiresAtMs } });
    expect(first.secretKeys.unlockedSessionFor(person.id)).toBe(login.session.id);
    await first.identityAccess.updateUser({ id: person.id, enabled: false });
    expect(first.secretKeys.unlockedSessionFor(person.id)).toBeNull();
    expect(await first.secretKeys.createSessionRevealAuthorization({ id: key.id, sessionId: login.session.id, userId: person.id, ttlMs: 10_000 }).then(() => "released", () => "refused")).toBe("refused");
    expect(admin.user.id).not.toBe(person.id);
    shutDown(first);
  });

  it("someone else setting a person's password ends that person's sessions, so nothing outlives it", async () => {
    const paths = pathsAt(root);
    const runtime = boot(paths);
    try {
      const admin = await signIn(runtime);
      const person = await runtime.identityAccess.upsertUser({ id: "user.person", username: "person", displayName: "Person", password: "dummy-person-password", roleId: "admin" });
      const login = await runtime.identityAccess.authenticate({ username: "person", password: "dummy-person-password" });
      await runtime.secretKeys.unlockSession({ sessionId: login.session.id, userId: person.id, authorizationPassword: "dummy-person-password", expiresAtMs: login.session.expiresAtMs });
      await runtime.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: "dummy-person-password", createdBy: person.id, actorSession: { sessionId: login.session.id, userId: person.id, expiresAtMs: login.session.expiresAtMs } });
      expect(runtime.secretKeys.unlockedSessionFor(person.id)).toBe(login.session.id);
      await runtime.identityAccess.setPasswordAuthorized({ userId: person.id, password: "dummy-person-password-2", sessionId: admin.session.id, authorizationPassword: PASSWORD, authorizationPin: undefined, authorizationTotp: undefined });
      expect(runtime.secretKeys.unlockedSessionFor(person.id)).toBeNull();
      await expect(runtime.identityAccess.validateSession(login.session.id)).resolves.toBeNull();
    } finally {
      shutDown(runtime);
    }
  });

  it("a person changing their own password keeps the browser they did it from and locks another, which says why", async () => {
    const paths = pathsAt(root);
    const runtime = boot(paths);
    try {
      const login = await signIn(runtime);
      const elsewhere = await runtime.identityAccess.authenticate({ username: "admin", password: PASSWORD });
      await runtime.secretKeys.unlockSession({ sessionId: elsewhere.session.id, userId: login.user.id, authorizationPassword: PASSWORD, expiresAtMs: elsewhere.session.expiresAtMs });
      const key = await runtime.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: login.user.id, actorSession: { sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs } });
      const paired = await pair(runtime, { userId: login.user.id, sessionId: elsewhere.session.id, expiresAtMs: elsewhere.session.expiresAtMs });
      expect(await keyReleasedTo(runtime, paired.gatewaySessionId, login.user.id, key.id)).toBe(KEY_VALUE);
      await runtime.identityAccess.setPasswordAuthorized({ userId: login.user.id, password: "dummy-admin-password-2", sessionId: login.session.id, authorizationPassword: PASSWORD, authorizationPin: undefined, authorizationTotp: undefined });
      expect(await keyReleasedTo(runtime, paired.gatewaySessionId, login.user.id, key.id)).toBeNull();
      const actor = { userId: login.user.id, sessionId: `client-gateway:${paired.gatewaySessionId}` };
      expect(runtime.automationStudio.conversations.callerFor(actor)).toMatchObject({ keyNeedsUnlock: true, keyLockReason: "password_changed" });
    } finally {
      shutDown(runtime);
    }
  });

  it("a person changing their own password ends their other sessions, and nothing started from one draws on the session that changed it", async () => {
    const paths = pathsAt(root);
    const runtime = boot(paths);
    try {
      const login = await signIn(runtime);
      const elsewhere = await runtime.identityAccess.authenticate({ username: "admin", password: PASSWORD });
      await runtime.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: login.user.id, actorSession: { sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs } });
      const other = { userId: login.user.id, sessionId: elsewhere.session.id };
      await runtime.identityAccess.setPasswordAuthorized({ userId: login.user.id, password: "dummy-admin-password-2", sessionId: login.session.id, authorizationPassword: PASSWORD, authorizationPin: undefined, authorizationTotp: undefined });
      await expect(runtime.identityAccess.validateSession(elsewhere.session.id)).resolves.toBeNull();
      await expect(runtime.identityAccess.validateSession(login.session.id)).resolves.not.toBeNull();
      expect(runtime.automationStudio.conversations.callerFor(other).keyNeedsUnlock).toBe(true);
      expect(runtime.automationStudio.conversations.callerFor({ userId: login.user.id, sessionId: login.session.id }).keyNeedsUnlock).toBe(false);
    } finally {
      shutDown(runtime);
    }
  });

  it("a browser approved with no password pairs fine, shows the setup step, and one unlock naming it is the only ask", async () => {
    const paths = pathsAt(root);
    const first = boot(paths);
    let current = first;
    try {
      const login = await signIn(first);
      const key = await first.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: login.user.id, actorSession: { sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs } });
      const paired = await pair(first, { userId: login.user.id, sessionId: login.session.id, expiresAtMs: login.session.expiresAtMs }, { proved: false });
      const actor = { userId: login.user.id, sessionId: `client-gateway:${paired.gatewaySessionId}` };
      expect(first.clientGateway.snapshot().sessions.find((session) => session.sessionId === paired.gatewaySessionId)?.status).toBe("ready");
      expect(first.automationStudio.conversations.callerFor(actor)).toMatchObject({ keyNeedsUnlock: true, keyLockReason: "first_unlock" });
      expect(await keyReleasedTo(first, paired.gatewaySessionId, login.user.id, key.id)).toBeNull();
      await first.secretKeys.unlockSession({ sessionId: login.session.id, userId: login.user.id, authorizationPassword: PASSWORD, expiresAtMs: login.session.expiresAtMs, unlockClients: [paired.holderId] });
      expect(await keyReleasedTo(first, paired.gatewaySessionId, login.user.id, key.id)).toBe(KEY_VALUE);
      // Its panel session then expires or ends with nothing proved; a restart comes too. It is not asked again.
      shutDown(first);
      current = boot(paths);
      const again = await reconnect(current, paired.token);
      expect(await keyReleasedTo(current, again.gatewaySessionId, login.user.id, key.id)).toBe(KEY_VALUE);
    } finally {
      shutDown(current);
    }
  });

  it("a stored row with no trusted client behind it takes nothing when the person signs in", async () => {
    const paths = pathsAt(root);
    const first = boot(paths);
    let current = first;
    try {
      const login = await signIn(first);
      await first.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: login.user.id, actorSession: { sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs } });
      const holderId = secretKeyPairedHolderId("trusted.nobody");
      const stolenHolder = { holderKind: "paired-client" as const, holderId, userId: login.user.id, expiresAtMs: Date.now() + 60_000 };
      await first.secretKeys.credentialUnlocks.presentCredential(stolenHolder, "dummy-forged-credential", { verified: true });
      shutDown(first);
      current = boot(paths);
      await signIn(current);
      await current.secretKeys.unlockSession({ sessionId: login.session.id, userId: login.user.id, authorizationPassword: PASSWORD, expiresAtMs: login.session.expiresAtMs, unlockClients: [holderId] });
      await expect(current.secretKeys.credentialUnlocks.presentCredential(stolenHolder, "dummy-forged-credential", { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    } finally {
      shutDown(current);
    }
  });

  it("the unlock store is on disk with deleted rows overwritten", async () => {
    const paths = pathsAt(root);
    const runtime = boot(paths);
    try {
      const login = await signIn(runtime);
      await runtime.secretKeys.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: login.user.id, actorSession: { sessionId: login.session.id, userId: login.user.id, expiresAtMs: login.session.expiresAtMs } });
      const paired = await pair(runtime, { userId: login.user.id, sessionId: login.session.id, expiresAtMs: login.session.expiresAtMs });
      await checkpointAll(root);
      expect((await sqliteFilesHolding(root, paired.holderId)).length).toBeGreaterThan(0);
      await runtime.clientGateway.receive(paired.gatewaySessionId, clientMessage("client.forget_pairing", {}));
      await expect(runtime.clientGateway.authorizeToken(paired.token)).resolves.toBeNull();
      await checkpointAll(root);
      expect(await sqliteFilesHolding(root, paired.holderId)).toEqual([]);
    } finally {
      shutDown(runtime);
    }
  });

  it("says a person with a locked key needs to unlock it, before any task", async () => {
    const { runtime, login, paired } = await pairedThenRestarted();
    try {
      const connected = await reconnect(runtime, paired.token);
      const actor = { userId: login.user.id, sessionId: `client-gateway:${connected.gatewaySessionId}` };
      expect(runtime.automationStudio.conversations.callerFor(actor).keyNeedsUnlock).toBe(false);
      await runtime.identityAccess.revokeSession(login.session.id);
      expect(runtime.automationStudio.conversations.callerFor(actor)).toMatchObject({ keyNeedsUnlock: true, keyLockReason: "signed_out" });
    } finally {
      shutDown(runtime);
    }
  });
});
