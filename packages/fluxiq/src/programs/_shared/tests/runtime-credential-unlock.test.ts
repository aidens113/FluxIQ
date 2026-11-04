// @fluxiq-test-group real-sql
// Through the real wiring: Identity Access, the Client Gateway and Secret Keys
// over stores on disk. A person pairs a browser, Core restarts, and the browser's
// next message brings the key back with no password. Each lock event then stays
// locked across a restart. At the production derivation cost. "admin" is the
// bootstrap administrator's default password; every other secret is a dummy.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayClientMessage } from "../../../client-gateway/index.ts";
import type { FluxIQHostPaths } from "../../../framework/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../index.ts";

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
async function pair(runtime: GlobalProgramRuntime, approver: { userId: string; sessionId: string }): Promise<{ gatewaySessionId: string; token: string }> {
  const session = runtime.clientGateway.connect();
  await runtime.clientGateway.receive(session.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome" }));
  const pairingCode = runtime.clientGateway.snapshot().pairings.find((pairing) => pairing.requestedBySessionId === session.sessionId)?.pairingCode ?? "";
  await runtime.clientGateway.approvePairing(pairingCode, { approvedByUserId: approver.userId, approvedBySessionId: approver.sessionId });
  return { gatewaySessionId: session.sessionId, token: tokenFrom(runtime, session.sessionId) };
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
    const paired = await pair(first, { userId: login.user.id, sessionId: login.session.id });
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
      const replay = current.clientGateway.connect();
      await current.clientGateway.receive(replay.sessionId, clientMessage("client.hello", { clientId: CLIENT_ID, clientType: "extension", name: "Chrome", token: paired.token }));
      expect(current.clientGateway.snapshot().sessions.find((session) => session.sessionId === replay.sessionId)?.status).toBe("pairing_required");
      // The newest still opens it, after another restart, and the old one's wrap is gone: even with the store, it opens nothing.
      const trustedClientId = current.clientGateway.snapshot().trustedClients.find((client) => client.clientId === CLIENT_ID)?.trustedClientId ?? "";
      shutDown(current);
      current = boot(paths);
      const holder = { holderKind: "paired-client" as const, holderId: `paired-client:${trustedClientId}`, heldAs: `paired-client:${trustedClientId}`, userId: login.user.id, expiresAtMs: Date.now() + 60_000 };
      await expect(current.secretKeys.credentialUnlocks.presentCredential(holder, paired.token)).resolves.toEqual({ unlockedKeyCount: 0 });
      const newest = await reconnect(current, again.token);
      expect(await keyReleasedTo(current, newest.gatewaySessionId, login.user.id, keyId)).toBe(KEY_VALUE);
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
      await runtime.secretKeys.unlockSession({ sessionId: "session.outside-identity", userId: login.user.id, authorizationPassword: PASSWORD, expiresAtMs: Date.now() + 60_000, unlockClients: true });
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
