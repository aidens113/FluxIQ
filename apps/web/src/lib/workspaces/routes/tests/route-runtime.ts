import { GlobalProgramApiRegistry } from "fluxiq";
import { IdentityAccessService, type Permission } from "fluxiq/auth";
import { IAM_ADMINISTRATOR_ACCESS, IAM_USER_ACCESS } from "fluxiq/platform";
import { vi } from "vitest";
import { FLUXIQ_SESSION_COOKIE } from "../../../session-cookie";

type Membership = { workspaceId: string; userId: string; status: string; createdAtMs: number };
type GatewaySession = { sessionId: string; clientId: string; clientType: string; trustedClientId: string; operatorUserId: string; projectId: string; activeRecordingId: string; metadata: { domainId: string }; managedHostId?: string };
type Profile = "local" | "self-hosted" | "service";

function dataInstance() {
  return {
    programs: {
      identityAccess: { validateSession: vi.fn(), snapshot: vi.fn() },
      api: new GlobalProgramApiRegistry(),
      clientGateway: { authorizeToken: vi.fn() }
    },
    programDirectory: vi.fn()
  };
}

const primary = dataInstance();
export const runtime = {
  identity: new IdentityAccessService(),
  primary,
  tenantA: dataInstance(),
  tenantB: dataInstance(),
  sessions: { a: "", b: "" },
  accounts: new Map<string, { status: string; deletion: null | object }>(),
  memberships: new Map<string, Membership[]>(),
  workspaces: new Set<string>(),
  policies: new Map<string, "admin" | "user" | "none">(),
  policyError: false,
  releases: { primary: vi.fn(), a: vi.fn(), b: vi.fn() },
  presenter: vi.fn(),
  resolveBrowser: vi.fn(),
  browserCurrent: true,
  browserSession: null as GatewaySession | null,
  manager: { tenancy: "multi", primaryWorkspaceId: "workspace-main", primary: () => ({ fluxiq: primary }), acquire: vi.fn() },
  store: { getAccount: vi.fn(), listMembershipsOfUser: vi.fn(), getWorkspace: vi.fn() }
};

export async function resetRouteRuntime() {
  vi.resetAllMocks();
  runtime.identity = new IdentityAccessService();
  const permissions: Permission[] = ["programs.read", "programs.write", "runtime.control"];
  await runtime.identity.upsertRole({ id: "operator", permissions });
  await runtime.identity.upsertRole({ id: "reader", permissions: ["programs.read"] });
  for (const user of ["a", "b"]) await runtime.identity.upsertUser({ id: `person-${user}`, username: `person-${user}`, displayName: `Person ${user}`, roleId: "operator" });
  runtime.sessions.a = (await runtime.identity.createSession("person-a")).id;
  runtime.sessions.b = (await runtime.identity.createSession("person-b")).id;
  runtime.manager.tenancy = "multi";
  runtime.policyError = false;
  runtime.browserCurrent = true;
  runtime.browserSession = { sessionId: "gateway-a", clientId: "browser-a", clientType: "extension", trustedClientId: "trust-a", operatorUserId: "person-a", projectId: "same-project", activeRecordingId: "same-recording", metadata: { domainId: "domain-a" } };
  runtime.accounts.clear();
  runtime.memberships.clear();
  runtime.workspaces.clear();
  runtime.policies.clear();
  for (const user of ["a", "b"]) {
    runtime.accounts.set(`person-${user}`, { status: "active", deletion: null });
    runtime.memberships.set(`person-${user}`, [{ userId: `person-${user}`, workspaceId: `tenant-${user}`, status: "active", createdAtMs: 1 }]);
    runtime.workspaces.add(`tenant-${user}`);
    runtime.policies.set(`tenant-${user}`, "admin");
  }
  runtime.primary.programs.identityAccess.validateSession.mockImplementation((sessionId: string) => runtime.identity.validateSession(sessionId));
  runtime.primary.programs.identityAccess.snapshot.mockImplementation(() => runtime.identity.snapshot());
  runtime.store.getAccount.mockImplementation(async (userId: string) => runtime.accounts.get(userId) ?? null);
  runtime.store.listMembershipsOfUser.mockImplementation(async (userId: string) => runtime.memberships.get(userId) ?? []);
  runtime.store.getWorkspace.mockImplementation(async (workspaceId: string) => runtime.workspaces.has(workspaceId) ? { workspaceId } : null);
  runtime.resolveBrowser.mockImplementation(async (token: string) => token === "browser-a-token" ? { lease: { workspaceId: "tenant-a", fluxiq: runtime.tenantA, release: runtime.releases.a }, revalidateAuthority: async () => runtime.browserCurrent } : null);
  runtime.manager.acquire.mockImplementation(async (workspaceId: string) => {
    if (workspaceId === "tenant-a") return { workspaceId, fluxiq: runtime.tenantA, release: runtime.releases.a };
    if (workspaceId === "tenant-b") return { workspaceId, fluxiq: runtime.tenantB, release: runtime.releases.b };
    if (workspaceId === "workspace-main") return { workspaceId, fluxiq: runtime.primary, release: runtime.releases.primary };
    throw new Error("Unexpected fixture workspace");
  });
  for (const [workspaceId, instance, label] of [["workspace-main", runtime.primary, "primary"], ["tenant-a", runtime.tenantA, "A"], ["tenant-b", runtime.tenantB, "B"]] as const) {
    instance.programs.api = registry(workspaceId);
    instance.programDirectory.mockImplementation((domainId: string | null) => directory(label, domainId));
  }
  runtime.tenantA.programs.clientGateway.authorizeToken.mockImplementation(async (token: string) => token === "browser-a-token" ? runtime.browserSession : null);
}

export function registry(workspaceId: string, profile: Profile = "service") {
  return new GlobalProgramApiRegistry({ iam: { profile, workspaceId, source: {
    resolvePolicySet: async () => {
      if (runtime.policyError) throw new Error("Synthetic private policy database path");
      const policy = runtime.policies.get(workspaceId);
      return { identity: policy === "admin" ? [IAM_ADMINISTRATOR_ACCESS] : policy === "user" ? [IAM_USER_ACCESS] : [], guardrails: [], sessions: [], boundary: null };
    },
    getRole: async () => null
  } } });
}

export function routeRequest(options: { cookie?: string | null; bearer?: string; url?: string; signal?: AbortSignal } = {}) {
  const headers = new Headers();
  const cookie = options.cookie === undefined ? runtime.sessions.a : options.cookie;
  if (cookie !== null) headers.set("cookie", `${FLUXIQ_SESSION_COOKIE}=${cookie}`);
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  return new Request(options.url ?? "https://panel.example.test/api/programs", { headers, ...(options.signal ? { signal: options.signal } : {}) });
}

export function directory(label: string, domainId: string | null = null) {
  return { scope: { domainId }, domains: [], domain: null, programs: [{ id: "same-program", title: `Tenant ${label}`, category: "tools", description: "Fixture directory", route: "/same-program", icon: "folder", status: "available", scope: "global", globalProgram: true }] };
}

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(complete => { resolve = complete; });
  return { promise, resolve };
}
