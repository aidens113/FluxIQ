// Covers model-access/recipient-decision.ts against the real registry and Secret Keys' real snapshot (t950, F4):
// for every kind of recipient, the push tells a paired session's person their model access exactly when that
// session's own `snapshot` call is answered, so the two never disagree. Recipients: a member allowed by their
// policies, a person denied the snapshot by a policy, a paired browser narrowed by `FluxIQBrowserSession`, a person
// outside the workspace, and, under `local`, a role with and without the snapshot's permission. Dummy values only.
import { describe, expect, it } from "vitest";
import type { IamPolicy, IamPolicySource } from "../../../../platform/iam/index.ts";
import { IAM_POLICY_LANGUAGE_VERSION, parseIamPolicyDocument } from "@fluxiq/contracts/iam";
import { IAM_CONNECTED_SESSION, IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import { registerSecretKeysApi, SecretKeysService } from "../../../secret-keys/index.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, hostProtectionOptions } from "../../../secret-keys/runtime/tests/secret-key-fixtures.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../api.ts";
import type { ProgramApiIamOptions } from "../../iam/index.ts";
import { modelAccessRecipientAllowed } from "../recipient-decision.ts";
import type { ModelAccessPushDirectory } from "../types.ts";

/** The permissions the paired program route leaves a token (`PAIRED_CLIENT_PERMISSIONS`), intersected with the role's. */
const ROUTE_PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write", "secrets.manage"] as const;

function policy(name: string, kind: IamPolicy["kind"], statements: unknown[]): IamPolicy {
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Id: name, Statement: statements }, kind);
  if (!parsed.success) throw new TypeError(parsed.error.message);
  return { name, kind, document: parsed.data };
}

/** A user policy that denies the snapshot outright, over `FluxIQUserAccess`'s grant: "denied by policy". */
const DENY_SNAPSHOT = policy("TestDenySnapshot", "identity", [{ Sid: "DenySnapshot", Effect: "Deny", Action: "secrets:Snapshot", Resource: "*" }]);

const DIRECTORY: ModelAccessPushDirectory = {
  users: ["alice", "denied", "outsider", "viewer", "blind"].map((id) => ({ id, roleId: id === "viewer" ? "viewer" : id === "blind" ? "blind" : "member", enabled: true })),
  roles: [
    { id: "member", permissions: ["programs.read", "programs.write", "secrets.manage"] },
    { id: "viewer", permissions: ["programs.read"] },
    { id: "blind", permissions: ["programs.write"] }
  ]
};

function source(byPerson: Readonly<Record<string, readonly IamPolicy[]>>, sessions: readonly IamPolicy[] = []): IamPolicySource {
  return {
    resolvePolicySet: async (principal) => ({ identity: byPerson[principal.id] ?? [], guardrails: [], sessions: [...sessions], boundary: null }),
    getRole: async () => null
  };
}

/** The actor the paired program route builds for a session of `userId`. */
function routeActor(userId: string): ProgramApiActor {
  const person = DIRECTORY.users.find((user) => user.id === userId)!;
  const role = DIRECTORY.roles.find((candidate) => candidate.id === person.roleId)!;
  const permissions = role.permissions.filter((permission) => (ROUTE_PERMISSIONS as readonly string[]).includes(permission)) as ProgramApiActor["permissions"];
  return { sessionId: `client-gateway:gw-${userId}`, userId, roleId: role.id, permissions, channel: "paired-client" };
}

async function agreement(iam: ProgramApiIamOptions, userId: string): Promise<{ snapshot: boolean; push: boolean }> {
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS }, ...hostProtectionOptions() });
  try {
    const registry = new GlobalProgramApiRegistry({ iam });
    registerSecretKeysApi(registry, service);
    await service.createKey({ name: "Mine", value: "dummy-value", kind: "llm", provider: "Anthropic", createdBy: "alice" });
    const answer = await registry.call({ programId: "secret-keys", endpoint: "snapshot", scope: {}, actor: routeActor(userId), payload: {} });
    if (!answer.ok) expect(answer.errorCode, userId).toBe("authorization.forbidden");
    const push = await modelAccessRecipientAllowed(registry, DIRECTORY, { sessionId: `gw-${userId}`, userId });
    return { snapshot: answer.ok, push };
  } finally {
    service.close();
  }
}

describe("the model-access push and the snapshot agree on every recipient (F4)", () => {
  const members = source({ alice: [IAM_USER_ACCESS], denied: [IAM_USER_ACCESS, DENY_SNAPSHOT] });

  it("tells a member their policies let read the snapshot", async () => {
    expect(await agreement({ profile: "service", source: members }, "alice")).toEqual({ snapshot: true, push: true });
  });

  it("tells nothing to a person a policy denies the snapshot", async () => {
    expect(await agreement({ profile: "service", source: members }, "denied")).toEqual({ snapshot: false, push: false });
  });

  it("tells nothing to a person outside the workspace", async () => {
    expect(await agreement({ profile: "service", source: members }, "outsider")).toEqual({ snapshot: false, push: false });
  });

  it("decides a paired browser under FluxIQBrowserSession as its snapshot call: its own person's readiness, nothing more", async () => {
    const browsers = source({ alice: [IAM_USER_ACCESS], denied: [IAM_USER_ACCESS, DENY_SNAPSHOT] }, [IAM_CONNECTED_SESSION]);
    expect(await agreement({ profile: "service", source: browsers }, "alice")).toEqual({ snapshot: true, push: true });
    expect(await agreement({ profile: "service", source: browsers }, "denied")).toEqual({ snapshot: false, push: false });
    // A session policy that left the snapshot out of scope refuses both alike.
    const narrowed = policy("TestStudioOnlySession", "session", [{ Sid: "StudioOnly", Effect: "Allow", Action: "studio:*", Resource: "*" }]);
    expect(await agreement({ profile: "service", source: source({ alice: [IAM_USER_ACCESS] }, [narrowed]) }, "alice")).toEqual({ snapshot: false, push: false });
  });

  it("decides a local role by its permissions as the snapshot does", async () => {
    expect(await agreement({ profile: "local" }, "viewer")).toEqual({ snapshot: true, push: true });
    expect(await agreement({ profile: "local" }, "blind")).toEqual({ snapshot: false, push: false });
  });
});
