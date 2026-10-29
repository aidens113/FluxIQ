import { GlobalProgramApiRegistry } from "fluxiq";
import { IAM_USER_ACCESS } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import { appRouteIamContract, authorizeAppRoute, pairedClientRouteActor, panelRouteActor, routeParamId, type AppRouteActor } from "..";

const ADMIN = ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"] as AppRouteActor["permissions"];

function actor(userId: string, permissions: AppRouteActor["permissions"]): AppRouteActor {
  return { sessionId: `session-${userId}`, userId, roleId: "role", permissions };
}

const approve = appRouteIamContract("POST", "/api/client-gateway/approve-pairing");
const recordings = appRouteIamContract("GET", "/api/recordings");
const writeAsset = appRouteIamContract("PUT", "/api/programs/automation-studio/state-assets/[projectId]/[sha256]");

describe("authorizeAppRoute on the local profile", () => {
  const registry = new GlobalProgramApiRegistry();

  it("allows exactly when the caller holds the route's permission, refusing in today's words", async () => {
    await expect(authorizeAppRoute(registry, approve, "panel", actor("a", ["runtime.control"]))).resolves.toBeNull();
    await expect(authorizeAppRoute(registry, approve, "panel", actor("v", ["programs.read"]))).resolves.toEqual({ status: 403, error: "Permission required: runtime.control" });
  });

  it("allows any authenticated caller on a route that required no permission, whatever it holds", async () => {
    await expect(authorizeAppRoute(registry, recordings, "panel", actor("nobody", []))).resolves.toBeNull();
    await expect(authorizeAppRoute(registry, recordings, "paired-client", actor("nobody", []))).resolves.toBeNull();
    await expect(authorizeAppRoute(registry, writeAsset, "paired-client", actor("viewer", ["programs.read"]), { projectId: "p" })).resolves.toBeNull();
    await expect(authorizeAppRoute(registry, writeAsset, "panel", actor("viewer", ["programs.read"]), { projectId: "p" })).resolves.toEqual({ status: 403, error: "Permission required: programs.write" });
  });

  it("decides with the caller's channel, whatever the actor said", async () => {
    const seen: unknown[] = [];
    const spy = {
      authorize: async (input: Parameters<GlobalProgramApiRegistry["authorize"]>[0]) => {
        seen.push(input);
        return registry.authorize(input);
      }
    };
    await authorizeAppRoute(spy, approve, "panel", { ...actor("a", ADMIN), channel: "paired-client" });
    expect(seen).toEqual([expect.objectContaining({ action: "gateway:ApprovePairing", permission: "runtime.control", resources: { kind: "user", self: true }, actor: expect.objectContaining({ channel: "panel" }) })]);
  });

  it("refuses to decide a caller the route does not accept", async () => {
    await expect(authorizeAppRoute(registry, approve, "paired-client", actor("a", ADMIN))).rejects.toThrow(/does not accept a paired-client caller/u);
  });
});

describe("authorizeAppRoute on the service profile", () => {
  function registry(): GlobalProgramApiRegistry {
    const built = new GlobalProgramApiRegistry({ iam: { profile: "service", source: { resolvePolicySet: async () => ({ identity: [IAM_USER_ACCESS], guardrails: [], sessions: [], boundary: null }), getRole: async () => null } } });
    built.registerResourceOwners("project", { ownerOf: async (id) => (id.startsWith("a-") ? "alice" : null) });
    return built;
  }

  it("decides by the caller's policies and the resource's owner", async () => {
    const built = registry();
    await expect(authorizeAppRoute(built, writeAsset, "panel", actor("alice", ADMIN), { projectId: "a-1" })).resolves.toBeNull();
    await expect(authorizeAppRoute(built, writeAsset, "panel", actor("bob", ADMIN), { projectId: "a-1" })).resolves.toEqual({ status: 403, error: "Not authorized: studio:WriteStateAsset" });
    await expect(authorizeAppRoute(built, writeAsset, "paired-client", actor("bob", ["programs.read"]), { projectId: "a-1" })).resolves.toEqual({ status: 403, error: "Not authorized: studio:WriteStateAsset" });
    await expect(authorizeAppRoute(built, appRouteIamContract("GET", "/api/framework/io"), "panel", actor("alice", ADMIN))).resolves.toEqual({ status: 403, error: "Not authorized: ops:InspectFrameworkIo" });
  });
});

describe("the route actors", () => {
  it("puts a signed-in person on the panel channel", () => {
    expect(panelRouteActor({ session: { id: "s" }, user: { id: "u" }, role: { id: "viewer", permissions: ["programs.read"] } })).toEqual({ sessionId: "s", userId: "u", roleId: "viewer", permissions: ["programs.read"], channel: "panel" });
  });

  it("acts for a paired client as its approver, narrowed, and not at all once the approver is gone", async () => {
    const identity = { snapshot: async () => ({ users: [{ id: "u", roleId: "admin", enabled: true }], roles: [{ id: "admin", permissions: ADMIN }] }) };
    await expect(pairedClientRouteActor(identity, { sessionId: "g", operatorUserId: "u" })).resolves.toEqual({
      sessionId: "client-gateway:g",
      userId: "u",
      roleId: "admin",
      permissions: ["programs.read", "programs.write", "flows.write", "runtime.control"],
      channel: "paired-client"
    });
    await expect(pairedClientRouteActor(identity, { sessionId: "g", operatorUserId: "gone" })).resolves.toBeNull();
  });

  it("reads a route param as an id, keeping one that does not decode", () => {
    expect(routeParamId("project%2Fone")).toBe("project/one");
    expect(routeParamId("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
