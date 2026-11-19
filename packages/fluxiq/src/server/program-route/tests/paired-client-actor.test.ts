// Covers paired-client-actor.ts: the actor a paired client's token call runs as, generic and per
// program-route endpoint (t955: `secrets.manage` only on the person's own model-key writes).
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

  it("adds secrets.manage to the person's own model-key writes alone, and only when their role holds it", () => {
    const owner = { sessionId: "g1", operatorUserId: "user:owner" };
    const keyWrites = ["save-model-key", "replace-model-key", "remove-model-key"];
    for (const endpoint of keyWrites) {
      expect(pairedClientEndpointActor(owner, directory, "secret-keys", endpoint), endpoint).toEqual({
        sessionId: "client-gateway:g1",
        userId: "user:owner",
        roleId: "role:admin",
        permissions: ["programs.read", "programs.write", "runtime.control", "flows.write", "secrets.manage"],
        channel: "paired-client",
      });
      // Named as a request names it: the route's allowlist reads ids case- and space-insensitively, and so does this.
      expect(pairedClientEndpointActor(owner, directory, " Secret-Keys ", endpoint.toUpperCase())?.permissions, endpoint).toContain("secrets.manage");
      // A role without it gains nothing: IAM then refuses the write, as it refuses the person's login.
      expect(pairedClientEndpointActor({ sessionId: "g1", operatorUserId: "user:viewer" }, directory, "secret-keys", endpoint)?.permissions, endpoint).toEqual(["programs.read"]);
      expect(pairedClientEndpointActor({ sessionId: "g1", operatorUserId: "user:off" }, directory, "secret-keys", endpoint), endpoint).toBeNull();
    }
    // Every other allowlisted endpoint gets exactly the generic actor, and so does one outside the allowlist.
    for (const [programId, endpoints] of Object.entries(PAIRED_CLIENT_ENDPOINTS)) {
      for (const endpoint of endpoints.filter((name) => !(programId === "secret-keys" && keyWrites.includes(name)))) {
        expect([programId, endpoint, pairedClientEndpointActor(owner, directory, programId, endpoint)]).toEqual([programId, endpoint, pairedClientActor(owner, directory)]);
      }
    }
    for (const [programId, endpoint] of [["secret-keys", "create-key"], ["secret-keys", "reveal-key"], ["identity-access", "save-model-key"], ["automation-studio", "remove-model-key"]]) {
      expect(pairedClientEndpointActor(owner, directory, programId!, endpoint!)?.permissions, `${programId}/${endpoint}`).not.toContain("secrets.manage");
    }
  });

  it("acts as nobody when the approving person is disabled, gone, or never recorded", () => {
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:off" }, directory)).toBeNull();
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:gone" }, directory)).toBeNull();
    expect(pairedClientActor({ sessionId: "g1" }, directory)).toBeNull();
  });
});
