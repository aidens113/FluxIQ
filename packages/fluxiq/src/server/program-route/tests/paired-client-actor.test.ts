// Covers paired-client-actor.ts: the actor a paired client's token call runs as, generic and per
// program-route endpoint (t955 narrowed `secrets.manage` to the person's own model-key writes; t1095 removed
// those writes from the token, so no endpoint adds a permission).
import { describe, expect, it } from "vitest";
import { pairedClientActor, pairedClientEndpointActor } from "../paired-client-actor.ts";
import { PAIRED_CLIENT_ENDPOINTS } from "../program-route.ts";

describe("a paired client's actor", () => {
  const directory = {
    users: [
      { id: "user:owner", roleId: "role:admin", enabled: true },
      { id: "user:viewer", roleId: "role:viewer", enabled: true },
      { id: "user:off", roleId: "role:admin", enabled: false },
    ],
    roles: [
      { id: "role:admin", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write", "identity.manage", "data.manage", "secrets.manage"] },
      { id: "role:viewer", permissions: ["programs.read"] },
    ],
  };

  it("acts as the approving person, with only the permissions the allowlist uses", () => {
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:owner" }, directory)).toEqual({
      // Core recognises a paired caller by this prefix and maps it to the person's
      // unlocked session (`AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX`,
      // packages/fluxiq/.../runtime/conversations/commands/caller.ts). Change both or neither.
      sessionId: "client-gateway:g1",
      userId: "user:owner",
      roleId: "role:admin",
      // Never identity.manage, data.manage or secrets.manage: the generic actor serves every paired call (t955).
      permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"],
      // Under the service profile the registry narrows a paired client by these permissions too.
      channel: "paired-client",
    });
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:viewer" }, directory)?.permissions).toEqual(["programs.read"]);
  });

  // t1095: key writes are the panel's, so no endpoint names a permission of its own any more.
  it("hands every allowlisted endpoint exactly the generic actor, so no paired call carries secrets.manage", () => {
    const owner = { sessionId: "g1", operatorUserId: "user:owner" };
    for (const [programId, endpoints] of Object.entries(PAIRED_CLIENT_ENDPOINTS)) {
      for (const endpoint of endpoints) {
        expect([programId, endpoint, pairedClientEndpointActor(owner, directory, programId, endpoint)]).toEqual([programId, endpoint, pairedClientActor(owner, directory)]);
      }
    }
    for (const [programId, endpoint] of [["secret-keys", "save-model-key"], ["secret-keys", "replace-model-key"], ["secret-keys", " Remove-Model-Key "], ["secret-keys", "create-key"], ["identity-access", "get-my-preferences"]]) {
      expect(pairedClientEndpointActor(owner, directory, programId!, endpoint!)?.permissions, `${programId}/${endpoint}`).not.toContain("secrets.manage");
      expect(pairedClientEndpointActor(owner, directory, programId!, endpoint!)?.permissions, `${programId}/${endpoint}`).not.toContain("identity.manage");
    }
    expect(pairedClientEndpointActor({ sessionId: "g1", operatorUserId: "user:off" }, directory, "identity-access", "get-my-preferences")).toBeNull();
  });

  it("acts as nobody when the approving person is disabled, gone, or never recorded", () => {
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:off" }, directory)).toBeNull();
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:gone" }, directory)).toBeNull();
    expect(pairedClientActor({ sessionId: "g1" }, directory)).toBeNull();
  });
});
