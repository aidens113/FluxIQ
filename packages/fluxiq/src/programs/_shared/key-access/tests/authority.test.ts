import { describe, expect, it, vi } from "vitest";
import { localSecretKeyUseAuthority } from "../authority.ts";

function fixture() {
  const state = { active: true, enabled: true, signedIn: false, permitted: true, offered: false, chosen: false };
  // The Flow's stored result-check grant, as the host's resolver reads it: null when none matches the principal.
  const stored: { grant: { grantedThrough: { kind: "person" } | { kind: "client"; trustedClientId: string }; keyId: string; expiresAtMs: number } | null } = {
    grant: { grantedThrough: { kind: "person" }, keyId: "key", expiresAtMs: Date.now() + 60_000 }
  };
  const authorize = vi.fn(async () => ({ allowed: state.permitted }));
  const authority = localSecretKeyUseAuthority({
    identity: {
      validateSession: async () => state.signedIn ? { user: { id: "owner" }, session: { expiresAtMs: Date.now() + 60_000 }, role: { id: "role", permissions: ["programs.write"] } } : null,
      snapshot: async () => ({ users: [{ id: "owner", enabled: state.enabled, roleId: "role" }], roles: [{ id: "role", permissions: ["programs.write", "secrets.manage"] }] })
    },
    gateway: { vouchesForClient: async (id: string, user: string) => id === "client" && user === "owner" && state.active },
    keys: { modelKeys: { resolveAssistant: async () => ({ ok: true, keyId: "key", ownerId: "other-owner", offeredByHolder: state.offered, chosenForWorkspace: state.chosen }) } },
    api: { authorize },
    resolveStanding: async () => stored.grant
  } as unknown as Parameters<typeof localSecretKeyUseAuthority>[0]);
  const key = { id: "key", createdBy: "owner" } as Parameters<typeof authority>[0]["key"];
  const principal = { kind: "client" as const, userId: "owner", trustedClientId: "client" };
  return { state, stored, authority, key, principal, authorize };
}

describe("independent client key authority", () => {
  it("allows a current client after the approving panel session ended", async () => {
    const f = fixture();
    expect(await f.authority({ principal: f.principal, key: f.key })).toMatchObject({ ownerUserId: "owner" });
    expect(f.authorize).toHaveBeenCalledWith(expect.objectContaining({ action: "secrets:UseKey", actor: expect.objectContaining({ channel: "paired-client", permissions: ["programs.write"] }) }));
  });
  it.each(["active", "enabled", "permitted"] as const)("refuses loss of %s independently of stored ciphertext", async (field) => {
    const f = fixture();
    f.state[field] = false;
    expect(await f.authority({ principal: f.principal, key: f.key })).toBeNull();
  });
  it("requires both workspace selection and the actual owner's offer", async () => {
    const f = fixture();
    f.key.createdBy = "other-owner";
    const principal = { ...f.principal, purpose: "workspace-assistant" as const };
    expect(await f.authority({ principal, key: f.key })).toBeNull();
    f.state.chosen = true;
    expect(await f.authority({ principal, key: f.key })).toBeNull();
    f.state.offered = true;
    expect(await f.authority({ principal: f.principal, key: f.key })).toBeNull();
    expect(await f.authority({ principal, key: f.key })).toMatchObject({ ownerUserId: "other-owner" });
  });
  it("does not turn an ownerless record into universal authenticated access", async () => {
    const f = fixture();
    delete f.key.createdBy;
    expect(await f.authority({ principal: f.principal, key: f.key })).toBeNull();
  });
});

describe("a Flow's standing result check", () => {
  const standing = { kind: "standing" as const, userId: "owner", authorizationId: "grant.one", projectId: "project.one", flowId: "flow.one", purpose: "loop_verification" as const };

  it("pays with the person's own key from the stored grant alone: no session, no unlock", async () => {
    const f = fixture();
    expect(await f.authority({ principal: standing, key: f.key })).toMatchObject({ ownerUserId: "owner" });
    expect(f.authorize).toHaveBeenCalledWith(expect.objectContaining({ action: "secrets:UseKey", resources: { kind: "key", keyId: "key" } }));
  });

  it("pays nothing once the grant no longer matches, names another key, or the client it was granted through is revoked", async () => {
    const f = fixture();
    f.stored.grant = null;
    expect(await f.authority({ principal: standing, key: f.key })).toBeNull();
    f.stored.grant = { grantedThrough: { kind: "person" }, keyId: "other-key", expiresAtMs: Date.now() + 60_000 };
    expect(await f.authority({ principal: standing, key: f.key })).toBeNull();
    f.stored.grant = { grantedThrough: { kind: "client", trustedClientId: "client" }, keyId: "key", expiresAtMs: Date.now() + 60_000 };
    expect(await f.authority({ principal: standing, key: f.key })).toMatchObject({ ownerUserId: "owner" });
    f.state.active = false;
    expect(await f.authority({ principal: standing, key: f.key })).toBeNull();
  });

  it("pays with the workspace's lent key only while it is chosen and offered, and IAM lets the person configure that Flow", async () => {
    const f = fixture();
    f.key.createdBy = "other-owner";
    expect(await f.authority({ principal: standing, key: f.key })).toBeNull();
    f.state.chosen = true;
    expect(await f.authority({ principal: standing, key: f.key })).toBeNull();
    f.state.offered = true;
    expect(await f.authority({ principal: standing, key: f.key })).toMatchObject({ ownerUserId: "other-owner" });
    expect(f.authorize).toHaveBeenLastCalledWith(expect.objectContaining({ action: "studio:UpdateFlowSettings", permission: "flows.write", resources: { kind: "project-child", projectId: "project.one", child: "flow", childId: "flow.one" } }));
    f.state.permitted = false;
    expect(await f.authority({ principal: standing, key: f.key })).toBeNull();
  });
});
