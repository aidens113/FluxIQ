import { IdentityAccessService } from "fluxiq";
import { createPlatformServices, MemoryEmailSender, MemoryIamAuditSink, type PlatformProvisioningCaller, type PlatformServices } from "fluxiq/platform";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DUMMY_PASSWORD, MemoryRecordRepository, WEAK_KDF } from "../../../app/api/accounts/server/tests/accounts-harness";

// A held read in a workspace whose membership is suspended while it runs:
// its next revalidation fails, and the person's next request works in their
// other workspace. Real platform services and Identity Access over memory
// repositories; the workspace manager is a stand-in that hands out leases.

const runtime = vi.hoisted(() => ({
  primary: null as unknown,
  services: null as unknown,
  manager: {
    tenancy: "multi" as const,
    primaryWorkspaceId: "workspace-main",
    primary: () => ({ fluxiq: runtime.primary }),
    acquire: async (workspaceId: string) => ({ workspaceId, fluxiq: { programs: {} }, release: () => undefined })
  }
}));

vi.mock("../../fluxiq", () => ({
  getFluxIQWorkspaces: () => runtime.manager,
  getFluxIQWebRuntimeStatus: () => { throw new Error("Not used under multi tenancy"); },
  isCurrentFluxIQPrimary: (instance: unknown) => instance === runtime.primary
}));
vi.mock("../../../server/provisioning-listener", () => ({ getPlatformServices: async () => runtime.services }));
vi.mock("../../../server/browser-trust", () => ({ resolveServiceClientHttpRoute: async () => null }));

import { FLUXIQ_SESSION_COOKIE } from "../../session-cookie";
import { workspaceProgramContext } from "../program-context";

const FIXTURE: PlatformProvisioningCaller = { kind: "in-process", actorUserId: null, transport: "in-process" };
let services: PlatformServices;
let personId = "";
let sessionId = "";

beforeEach(async () => {
  const identity = new IdentityAccessService({ repository: new MemoryRecordRepository(), passwordKdf: WEAK_KDF });
  const repository = new MemoryRecordRepository();
  services = await createPlatformServices({ repository, iamRepository: repository, identity, email: new MemoryEmailSender(), auditSink: new MemoryIamAuditSink(), publicOrigin: "https://app.example.test/", tenancy: { mode: "multi" }, entitlements: { organisation: true } });
  for (const workspaceId of ["tenant-a", "tenant-b"]) await services.store.putWorkspace({ workspaceId, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
  const create = async (email: string, policy: string) => {
    const answer = await services.provisioning.run("createAccount", { requestId: `create-${email.split("@")[0]}`, email, displayName: email, policies: [policy], workspace: "tenant-a", password: DUMMY_PASSWORD }, FIXTURE);
    if (!answer.ok || answer.result.status !== "created") throw new Error("fixture account was not created");
    return answer.result.userId;
  };
  await create("admin-a@example.test", "FluxIQAdministratorAccess");
  personId = await create("person@example.test", "FluxIQUserAccess");
  const added = await services.provisioning.run("addMember", { requestId: "add-b", userId: personId, workspaceId: "tenant-b", policies: ["FluxIQUserAccess"] }, FIXTURE);
  if (!added.ok) throw new Error("fixture member was not added");
  sessionId = (await identity.createSession(personId)).id;
  runtime.primary = { programs: { identityAccess: identity } };
  runtime.services = services;
});

function request(): Request {
  return new Request("https://panel.example.test/api/programs/example/snapshot", { headers: { cookie: `${FLUXIQ_SESSION_COOKIE}=${sessionId}` } });
}

describe("a held read when its membership is suspended", () => {
  it("fails its next revalidation, and the next request works in the person's other workspace", async () => {
    const held = await workspaceProgramContext(request());
    if (held === null) throw new Error("expected a workspace context");
    expect(held.workspaceId).toBe("tenant-a");
    expect(await held.context.revalidateAuthority!()).toBe(true);
    const suspended = await services.provisioning.run("suspendMember", { requestId: "suspend-a", userId: personId, workspaceId: "tenant-a", reason: "Left the team" }, FIXTURE);
    expect(suspended.ok).toBe(true);
    expect(await held.context.revalidateAuthority!()).toBe(false);
    held.release();
    const next = await workspaceProgramContext(request());
    expect(next?.workspaceId).toBe("tenant-b");
    next?.release();
  });
});
