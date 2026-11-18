import { DEDICATED_ENVIRONMENT_CAPABILITY } from "fluxiq/platform";
import type { EnvironmentRecord, PlatformWorkspaceRecord } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import { hostedCloudAuthorizer } from "../hosted-cloud-authorizer";
import type { HostedEnvironmentActor } from "../types";

const workspaces = new Map<string, PlatformWorkspaceRecord>([
  ["ws-a", { workspaceId: "ws-a", kind: "personal", ownerUserId: "account-a", createdAtMs: 0 }],
  ["org", { workspaceId: "org", kind: "organisation", ownerUserId: null, createdAtMs: 0 }]
]);
const records = new Map<string, EnvironmentRecord>([
  ["env-b", { environmentId: "env-b", accountId: "account-b", workspaceId: "ws-b", driver: "fake", desired: "running", observed: "running", operationId: "op" }]
]);
const authorize = hostedCloudAuthorizer({ workspaces: { getWorkspace: async (id) => workspaces.get(id) ?? null }, environments: { get: async (id) => records.get(id) ?? null }, region: "local" });

function actor(workspaceId: string, outcome: "ok" | "refused" | "paired" = "ok"): HostedEnvironmentActor {
  return {
    workspaceId,
    revalidate: async () => {
      if (outcome === "refused") return { ok: false, status: 403, error: "Not authorized" };
      const binding = outcome === "paired"
        ? { channel: "paired-client" as const, workspaceId, userId: "person-1", sessionId: "s", trustedClientId: "t", clientId: "c", clientType: "extension", domainId: null, projectId: null, recordingId: null }
        : { channel: "panel" as const, workspaceId, userId: "person-1", sessionId: "s" };
      return { ok: true, caller: { channel: binding.channel, actor: { sessionId: "s", userId: "person-1", roleId: "r", permissions: [], channel: binding.channel }, binding } };
    }
  };
}

const request = (who: unknown, overrides: Record<string, string> = {}) => ({ actor: who, workspaceId: "ws-a", targetId: "env-1", capability: DEDICATED_ENVIRONMENT_CAPABILITY, ...overrides });

describe("hostedCloudAuthorizer", () => {
  it("answers the workspace owner's account and a dedicated target in the deployment's region", async () => {
    expect(await authorize(request(actor("ws-a")))).toEqual({
      principalId: "person-1",
      accountId: "account-a",
      workspaceId: "ws-a",
      target: { kind: "managed-cloud", allocation: "dedicated", region: "local", targetId: "env-1", ownerAccountId: "account-a", ownerWorkspaceId: "ws-a", capabilities: [DEDICATED_ENVIRONMENT_CAPABILITY] },
      cloudAuthorization: { accountId: "account-a", workspaceId: "ws-a" }
    });
  });

  it("refuses an actor that is not a held request authority, no longer revalidates, or is a paired client", async () => {
    expect(await authorize(request({ workspaceId: "ws-a", accountId: "account-a" }))).toBeNull();
    expect(await authorize(request("verified-session"))).toBeNull();
    expect(await authorize(request(actor("ws-a", "refused")))).toBeNull();
    expect(await authorize(request(actor("ws-a", "paired")))).toBeNull();
  });

  it("refuses another workspace, another capability, a workspace without a paying account and another account's environment", async () => {
    expect(await authorize(request(actor("ws-a"), { workspaceId: "ws-b" }))).toBeNull();
    expect(await authorize(request(actor("ws-a"), { capability: "execute" }))).toBeNull();
    expect(await authorize(request(actor("org"), { workspaceId: "org" }))).toBeNull();
    expect(await authorize(request(actor("ws-a"), { targetId: "env-b" }))).toBeNull();
  });
});
