import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fluxiqLayoutV3Paths, IdentityAccessService, initializeFluxIQLayoutV3, type FluxIQ } from "fluxiq";
import { HeldKeys } from "fluxiq/secret-keys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTenantFluxIQ } from "../create-tenant";

vi.mock("../initialize-storage", () => ({ initializeFluxIQWebStorage: async () => undefined }));

// Sign-out revokes the session on the platform identity. A tenant's keys are
// held in the manager's custody, so the sign-out must reach that custody too.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tenantWithHeldSession() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-tenant-custody-"));
  roots.push(dataRoot);
  const layout = fluxiqLayoutV3Paths(dataRoot);
  await initializeFluxIQLayoutV3(layout);
  await mkdir(path.join(layout.workspacesDir, "tenant-one"), { recursive: true });
  const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  const user = await identity.upsertUser({ username: "person", displayName: "Person", roleId: "admin", password: "a dummy fixture password" });
  const session = await identity.createSession(user.id);
  const stranger = await identity.createSession(user.id);
  const heldKeys = new HeldKeys();
  for (const held of [session, stranger]) {
    const expiryTimer = setTimeout(() => undefined, 60_000);
    expiryTimer.unref?.();
    heldKeys.holdSession({ sessionId: held.id, userId: user.id, expiresAtMs: Date.now() + 60_000, decryptionKeys: new Map([["key-1", { keyUpdatedAtMs: 1, decryptionKey: Buffer.alloc(32, 1) }]]), expiryTimer });
  }
  const instantiate = vi.fn(() => ({ close: vi.fn(async () => undefined) }) as unknown as FluxIQ);
  await createTenantFluxIQ({ dataRoot, workspaceId: "tenant-one", heldKeys, instantiate, secretKeyIdentityAuthority: async () => identity, env: {} });
  return { dataRoot, identity, heldKeys, userId: user.id, session, stranger };
}

describe("tenant key custody and sign-out", () => {
  it("drops the tenant's held unlock for exactly the session that signs out", async () => {
    const f = await tenantWithHeldSession();
    expect(f.heldKeys.sessionsFor(f.userId)).toHaveLength(2);
    await f.identity.revokeSession(f.session.id);
    expect(f.heldKeys.sessionsFor(f.userId).map((held) => held.sessionId)).toEqual([f.stranger.id]);
    await f.identity.revokeSession(f.stranger.id);
    expect(f.heldKeys.sessionsFor(f.userId)).toEqual([]);
  });

  it("subscribes a custody to one identity once, however many times its tenant opens", async () => {
    const f = await tenantWithHeldSession();
    const subscribed = vi.spyOn(f.identity, "subscribeSessionRevocation");
    for (let opens = 0; opens < 3; opens += 1) {
      await createTenantFluxIQ({ dataRoot: f.dataRoot, workspaceId: "tenant-one", heldKeys: new HeldKeys(), instantiate: () => ({ close: async () => undefined }) as unknown as FluxIQ, secretKeyIdentityAuthority: async () => f.identity, env: {} });
    }
    expect(subscribed).toHaveBeenCalledTimes(3);
    for (let opens = 0; opens < 3; opens += 1) {
      await createTenantFluxIQ({ dataRoot: f.dataRoot, workspaceId: "tenant-one", heldKeys: f.heldKeys, instantiate: () => ({ close: async () => undefined }) as unknown as FluxIQ, secretKeyIdentityAuthority: async () => f.identity, env: {} });
    }
    expect(subscribed).toHaveBeenCalledTimes(3);
  });
});
