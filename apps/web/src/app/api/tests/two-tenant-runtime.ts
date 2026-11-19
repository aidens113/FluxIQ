import { GlobalProgramApiRegistry, IdentityAccessService } from "fluxiq";
import { createPlatformServices, MemoryEmailSender, MemoryIamAuditSink, type PlatformProvisioningCaller, type PlatformServices } from "fluxiq/platform";
import { vi } from "vitest";
import { FLUXIQ_SESSION_COOKIE } from "../../../lib/session-cookie";
import { serviceWorkspaceIam } from "../../../lib/workspaces";
import { memoryAudit } from "../security/server/tests/audit-harness";
import { DUMMY_PASSWORD, MemoryRecordRepository, WEAK_KDF } from "../accounts/server/tests/accounts-harness";

// Test support for the accounts and activity routes on the hosted `service`
// profile with two tenant workspaces. Everything that decides is real: the
// platform services (provisioning, store, each workspace's IAM store) over
// memory repositories, Identity Access (at the test-only weak key-derivation
// cost), each tenant instance's registry wired by `serviceWorkspaceIam`
// exactly as production wires it, and the routes' own selection of the
// caller's workspace. Only the process runtime is a fixture: the workspace
// manager hands out leases it counts, and the primary instance's registry
// throws if anything asks it to decide. Every password here is a dummy value.

export const PRIMARY = "platform-root";
export const TENANT_A = "tenant-a";
export const TENANT_B = "tenant-b";

export type Person = { userId: string; sessionId: string };
type Instance = { paths?: unknown; programs: Record<string, unknown> };

function primaryApi() {
  return { authorize: vi.fn(async () => { throw new Error("The primary instance's IAM decided a workspace call"); }) };
}

export const twoTenants = {
  services: null as unknown as PlatformServices,
  identity: null as unknown as IdentityAccessService,
  /** Every tenant registry's decisions: the platform IAM audit the activity route reads. */
  decisions: new MemoryIamAuditSink(),
  email: new MemoryEmailSender(),
  primary: { programs: {} } as Instance,
  /** Calls to the primary's reload, which a refused framework setup must never make. */
  reload: vi.fn(async () => undefined),
  /** What the primary instance was asked for; a workspace call must leave it empty. */
  primaryTouched: [] as string[],
  /** Paired-client tokens the fixture's browser-trust route resolves, each to its tenant and gateway session. */
  pairedTokens: new Map<string, { workspaceId: string; session: Record<string, unknown> }>(),
  primaryApi: primaryApi(),
  instances: new Map<string, Instance>(),
  /** Leases taken and not yet released, by workspace. */
  held: new Map<string, number>(),
  acquired: [] as string[],
  /** The panel cookie the next request carries; `next/headers` reads it. */
  cookie: undefined as string | undefined,
  people: {} as Record<"adminA" | "memberA" | "adminB" | "memberB" | "shared", Person>,
  manager: {
    tenancy: "multi" as "single" | "multi",
    primaryWorkspaceId: PRIMARY,
    primary: () => ({ workspaceId: PRIMARY, fluxiq: twoTenants.primary }),
    get: (workspaceId: string) => {
      const fluxiq = twoTenants.instances.get(workspaceId);
      return fluxiq ? { workspaceId, fluxiq } : undefined;
    },
    acquire: vi.fn(async (workspaceId: string) => {
      const fluxiq = twoTenants.instances.get(workspaceId);
      if (!fluxiq) throw new Error("Fixture workspace is absent");
      twoTenants.acquired.push(workspaceId);
      twoTenants.held.set(workspaceId, (twoTenants.held.get(workspaceId) ?? 0) + 1);
      let released = false;
      return { workspaceId, fluxiq, release: () => {
        if (released) return;
        released = true;
        twoTenants.held.set(workspaceId, (twoTenants.held.get(workspaceId) ?? 0) - 1);
      } };
    })
  }
};

/** How many leases are still held across every workspace. */
export function outstandingLeases(): number {
  return [...twoTenants.held.values()].reduce((sum, count) => sum + count, 0);
}

let requests = 0;
const FIXTURE: PlatformProvisioningCaller = { kind: "in-process", actorUserId: null, transport: "in-process" };

function requestId(): string {
  return `two-tenants-${(requests += 1)}`;
}

async function person(email: string, workspace: string, policy: string): Promise<Person> {
  const answer = await twoTenants.services.provisioning.run("createAccount", { requestId: requestId(), email, displayName: email, policies: [policy], workspace, password: DUMMY_PASSWORD }, FIXTURE);
  if (!answer.ok || answer.result.status !== "created") throw new Error("fixture person was not created");
  const session = await twoTenants.identity.createSession(answer.result.userId);
  return { userId: answer.result.userId, sessionId: session.id };
}

async function addMember(userId: string, workspaceId: string, policy: string): Promise<void> {
  const answer = await twoTenants.services.provisioning.run("addMember", { requestId: requestId(), userId, workspaceId, policies: [policy] }, FIXTURE);
  if (!answer.ok) throw new Error(`fixture member was not added: ${answer.error.code}`);
}

/** Two organisation workspaces, each with an administrator and a member, and one person in both (a member of A first, an administrator of B). */
export async function resetTwoTenants() {
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  vi.stubEnv("FLUXIQ_PUBLIC_ORIGIN", "https://app.example.test");
  const repository = new MemoryRecordRepository();
  twoTenants.identity = new IdentityAccessService({ repository: new MemoryRecordRepository(), passwordKdf: WEAK_KDF });
  twoTenants.decisions = new MemoryIamAuditSink();
  twoTenants.email = new MemoryEmailSender();
  twoTenants.services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity: twoTenants.identity,
    email: twoTenants.email,
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" },
    entitlements: { organisation: true }
  });
  twoTenants.primaryApi = primaryApi();
  twoTenants.primaryTouched = [];
  twoTenants.reload.mockClear();
  const refuseOnPrimary = (name: string) => vi.fn(async () => {
    twoTenants.primaryTouched.push(name);
    throw new Error(`The primary instance's ${name} was used for a workspace call`);
  });
  twoTenants.primary = { paths: { fluxiq: "platform-root/.fluxiq" }, programs: {
    identityAccess: twoTenants.identity,
    api: twoTenants.primaryApi,
    get secretKeys() {
      twoTenants.primaryTouched.push("secretKeys");
      return { credentialUnlocks: { presentPanelSession: refuseOnPrimary("secretKeys.presentPanelSession") }, unlockSession: refuseOnPrimary("secretKeys.unlockSession") };
    },
    clientGateway: { approvePairing: refuseOnPrimary("clientGateway.approvePairing"), dismissPairing: refuseOnPrimary("clientGateway.dismissPairing"), ready: async () => undefined, authorizeToken: refuseOnPrimary("clientGateway.authorizeToken") }
  } } as Instance;
  twoTenants.instances = new Map([[PRIMARY, twoTenants.primary]]);
  for (const workspaceId of [TENANT_A, TENANT_B]) {
    await twoTenants.services.store.putWorkspace({ workspaceId, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
    const iam = serviceWorkspaceIam(workspaceId, { platformServices: async () => twoTenants.services, audit: twoTenants.decisions });
    twoTenants.instances.set(workspaceId, { programs: {
      api: new GlobalProgramApiRegistry({ iam }),
      secretKeys: { unlockSession: vi.fn(async () => undefined), snapshot: async () => ({ keys: [] }) },
      clientGateway: {
        approvePairing: vi.fn(async (code: string) => ({ id: `${workspaceId}:${code}` })),
        dismissPairing: vi.fn(() => true),
        ready: async () => undefined,
        authorizeToken: vi.fn(async (token: string) => twoTenants.pairedTokens.get(token)?.workspaceId === workspaceId ? twoTenants.pairedTokens.get(token)!.session : null)
      }
    } });
  }
  twoTenants.manager.tenancy = "multi";
  twoTenants.manager.acquire.mockClear();
  twoTenants.held = new Map();
  twoTenants.acquired = [];
  twoTenants.cookie = undefined;
  twoTenants.pairedTokens = new Map();
  const adminA = await person("admin-a@example.test", TENANT_A, "FluxIQAdministratorAccess");
  const memberA = await person("member-a@example.test", TENANT_A, "FluxIQUserAccess");
  const shared = await person("shared@example.test", TENANT_A, "FluxIQUserAccess");
  const adminB = await person("admin-b@example.test", TENANT_B, "FluxIQAdministratorAccess");
  const memberB = await person("member-b@example.test", TENANT_B, "FluxIQUserAccess");
  await addMember(shared.userId, TENANT_B, "FluxIQAdministratorAccess");
  twoTenants.people = { adminA, memberA, adminB, memberB, shared };
  return twoTenants;
}

/** A request from `who` (their panel cookie, or none), JSON `body` when given. */
export function asPerson(who: Person | null, url: string, body?: unknown): Request {
  twoTenants.cookie = who?.sessionId;
  const headers = new Headers();
  if (who) headers.set("cookie", `${FLUXIQ_SESSION_COOKIE}=${who.sessionId}`);
  if (body === undefined) return new Request(url, { headers });
  headers.set("content-type", "application/json");
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}

/** The `next/headers` module: the cookie is the current caller's. */
export function nextHeadersMock() {
  return { cookies: async () => ({ get: (name: string) => (name === FLUXIQ_SESSION_COOKIE && twoTenants.cookie !== undefined ? { value: twoTenants.cookie } : undefined) }) };
}

/** The `lib/fluxiq` module: the primary instance is the identity directory; the manager holds the tenants. */
export function fluxiqModuleMock() {
  return {
    getFluxIQ: () => twoTenants.primary,
    getFluxIQWorkspaces: () => twoTenants.manager,
    getFluxIQWebRuntimeStatus: () => { throw new Error("Not used under multi tenancy"); },
    isCurrentFluxIQPrimary: (instance: unknown) => instance === twoTenants.primary,
    reloadFluxIQWebInstance: twoTenants.reload
  };
}

/** The `server/provisioning-listener` module: the one platform composition, its store, and the audit the tenant registries wrote. */
export function provisioningListenerMock() {
  return {
    getPlatformServices: async () => twoTenants.services,
    platformReadStoreFor: async (primary: unknown) => {
      if (primary !== twoTenants.primary) throw new Error("Unexpected account fixture instance");
      return twoTenants.services.store;
    },
    platformIamAuditReaderFor: async (primary: unknown) => {
      if (primary !== twoTenants.primary) throw new Error("Unexpected audit fixture instance");
      return memoryAudit([...twoTenants.decisions.records]);
    }
  };
}
