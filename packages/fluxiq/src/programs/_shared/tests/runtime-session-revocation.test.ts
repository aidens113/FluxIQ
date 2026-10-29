// The global runtime subscribes Secret Keys to Identity Access's session
// revocations: an administrator's revoke, by the digest the panel lists, drops
// the revoked session's unlock through the real wiring, a non-administrator is
// refused by the endpoint's permission check, and a sign-out drops the user's
// own unlock. In memory, at the production derivation cost. "admin" is the
// bootstrap administrator's default password; every other secret is a dummy.

import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../../index.ts";
import type { ProgramApiActor } from "../api.ts";

const BOOTSTRAP_PASSWORD = "admin";
const VIEWER_PASSWORD = "dummy-password-viewer";

function actorOf(login: { session: { id: string }; user: { id: string }; role: { id: string; permissions: ProgramApiActor["permissions"] } }): ProgramApiActor {
  return { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions };
}

describe("global runtime session-revocation wiring", () => {
  it("drops a session's Secret Keys unlock on an administrator's revoke by digest, and on the user's own sign-out", async () => {
    const runtime = createGlobalProgramRuntime(undefined, { modelProvidersEnabled: false });
    try {
      const { identityAccess, secretKeys, api } = runtime;
      const admin = await identityAccess.authenticate({ username: "admin", password: BOOTSTRAP_PASSWORD });
      await identityAccess.upsertUser({ id: "user.viewer", username: "viewer", displayName: "Viewer", roleId: "viewer", password: VIEWER_PASSWORD });
      const viewer = await identityAccess.authenticate({ username: "viewer", password: VIEWER_PASSWORD });
      await secretKeys.createKey({ name: "Provider", value: "dummy-provider-secret-value", authorizationPassword: VIEWER_PASSWORD, createdBy: "user.viewer" });
      await secretKeys.createKey({ name: "Admin provider", value: "dummy-admin-secret-value", authorizationPassword: BOOTSTRAP_PASSWORD, createdBy: admin.user.id });
      await secretKeys.unlockSession({ sessionId: viewer.session.id, userId: "user.viewer", authorizationPassword: VIEWER_PASSWORD, expiresAtMs: viewer.session.expiresAtMs });
      await secretKeys.unlockSession({ sessionId: admin.session.id, userId: admin.user.id, authorizationPassword: BOOTSTRAP_PASSWORD, expiresAtMs: admin.session.expiresAtMs });
      expect(secretKeys.unlockedSessionFor("user.viewer")).toBe(viewer.session.id);

      const sessions = (await identityAccess.snapshot()).sessions;
      const viewerDigest = sessions.find((session) => session.userId === "user.viewer")?.id ?? "";
      const adminDigest = sessions.find((session) => session.userId === admin.user.id)?.id ?? "";
      expect(viewerDigest).toMatch(/^[0-9a-f]{64}$/u);

      // A viewer may not revoke the administrator's session: the endpoint's permission check refuses it.
      await expect(api.call({ programId: "identity-access", endpoint: "revoke-session", scope: {}, actor: actorOf(viewer), payload: { sessionDigest: adminDigest } }))
        .resolves.toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      expect(secretKeys.unlockedSessionFor(admin.user.id)).toBe(admin.session.id);

      // The administrator revokes the viewer's session by the digest the snapshot lists.
      await expect(api.call({ programId: "identity-access", endpoint: "revoke-session", scope: {}, actor: actorOf(admin), payload: { sessionDigest: viewerDigest } }))
        .resolves.toMatchObject({ ok: true, payload: { revoked: true } });
      expect(secretKeys.unlockedSessionFor("user.viewer")).toBeNull();
      await expect(identityAccess.validateSession(viewer.session.id)).resolves.toBeNull();
      expect(secretKeys.unlockedSessionFor(admin.user.id)).toBe(admin.session.id);

      // The administrator's own sign-out (the raw cookie, no named revoker) drops their own unlock.
      await expect(identityAccess.revokeSession(admin.session.id)).resolves.toBe(true);
      expect(secretKeys.unlockedSessionFor(admin.user.id)).toBeNull();
      expect(secretKeys.activeSessionUnlockCount()).toBe(0);
    } finally {
      await runtime.automationStudio.close();
      runtime.secretKeys.close();
    }
  }, 120_000);
});
