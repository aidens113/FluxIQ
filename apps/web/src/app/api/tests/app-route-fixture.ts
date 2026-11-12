// Test support for the app route IAM tests (t803-H2): a FluxIQ whose program
// API is a real `GlobalProgramApiRegistry` the test builds, and whose other
// collaborators answer success, so a route's status says only how it was
// decided. People sign in by cookie; paired clients carry a token approved by
// one of them. No live server, no storage, and no token or cookie is printed.
// The accounts and activity routes also reach the platform services and the
// IAM audit, which answer here as one workspace holding one pending invitee,
// so an allowed call runs to its end and a refused one never reaches them.

import { NextRequest } from "next/server";
import type { GlobalProgramApiRegistry } from "fluxiq";

const ADMIN_PERMISSIONS = ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"];

/** The people: today's admin and viewer, and two hosted users. */
export const PEOPLE = {
  admin: { id: "user-admin", roleId: "admin" },
  viewer: { id: "user-viewer", roleId: "viewer" },
  alice: { id: "alice", roleId: "user" },
  bob: { id: "bob", roleId: "user" }
} as const;

export type Person = keyof typeof PEOPLE;

/** The one workspace, and the person every accounts change acts on: invited, never signed in. */
export const FIXTURE_WORKSPACE = "workspace-main";
export const INVITEE = { id: "user-invitee", roleId: "viewer" } as const;

const ROLES = [
  { id: "admin", permissions: ADMIN_PERMISSIONS },
  { id: "viewer", permissions: ["programs.read"] },
  // Every permission, so a hosted user's refusal is the policies', never a missing permission.
  { id: "user", permissions: ADMIN_PERMISSIONS }
];

/** Who calls: a person's cookie, or a paired client's token approved by that person. */
export type RouteCaller = { kind: "cookie" | "token"; person: Person };

const SHA = "a".repeat(64);

export const fixture: { registry: GlobalProgramApiRegistry | null; cookie: string | undefined } = { registry: null, cookie: undefined };

function role(roleId: string) {
  const found = ROLES.find((item) => item.id === roleId);
  if (!found) throw new Error(`fixture role ${roleId} is missing`);
  return found;
}

function personOf(prefix: string, value: string | null | undefined): (typeof PEOPLE)[Person] | null {
  if (!value?.startsWith(prefix)) return null;
  const name = value.slice(prefix.length);
  return Object.hasOwn(PEOPLE, name) ? PEOPLE[name as Person] : null;
}

const fluxiq = {
  programs: {
    get api() {
      if (!fixture.registry) throw new Error("fixture registry is not set");
      return fixture.registry;
    },
    identityAccess: {
      validateSession: async (sessionId: string | undefined) => {
        const person = personOf("cookie-", sessionId);
        return person && sessionId ? { session: { id: sessionId, userId: person.id, expiresAtMs: Date.now() + 60_000 }, user: { id: person.id }, role: role(person.roleId) } : null;
      },
      snapshot: async () => ({ users: [...Object.values(PEOPLE), INVITEE].map((person) => ({ ...person, displayName: person.id, username: person.id, enabled: true })), roles: ROLES }),
      // Every re-proof passes, so an accounts change is decided by IAM alone.
      authorizeSessionCredentials: async () => undefined
    },
    clientGateway: {
      ready: async () => undefined,
      access: { forgetByCredential: async () => true },
      authorizeToken: async (token: string) => {
        const person = personOf("token-", token);
        return person ? { sessionId: `gateway-${person.id}`, clientId: `client-${person.id}`, trustedClientId: `trusted-${person.id}`, operatorUserId: person.id, projectId: null, metadata: { domainId: "web-automation" } } : null;
      },
      snapshot: () => ({ sessions: [] }),
      approvePairing: async () => ({ sessionId: "gateway-paired", status: "ready" }),
      dismissPairing: () => true,
      receiveTraceArtifact: () => ({ status: "accepted", traces: 1 })
    },
    automationStudio: {
      listRecordingSummaries: async () => ({ items: [], page: 1, pageSize: 10, total: 0 }),
      assertProjectDomainAccess: async () => undefined,
      readProjectObjectAsset: async () => ({ content: new Uint8Array([1]), mediaType: "image/png", size: 1, sha256: SHA }),
      writeProjectObjectAsset: async () => ({ sha256: SHA, contentRef: `object:${SHA}` }),
      runDatasets: {
        streamRunDataset: async () => ({
          format: "csv",
          fileName: "rows.csv",
          contentType: "text/csv; charset=utf-8",
          [Symbol.asyncIterator]: async function* () { yield "Title\r\n"; }
        })
      }
    }
  },
  paths: {},
  inspectStorage: () => ({}),
  domains: { summaries: () => [] },
  setup: async () => ({}),
  migrateStorage: async () => ({}),
  rollbackStorageMigration: async () => ({}),
  ioSnapshot: () => ({}),
  validateDomainIo: () => [],
  validateIoRequirements: () => [],
  programDirectory: () => ({ scope: {}, domains: [], domain: null, programs: [] })
};

const workspaces = { tenancy: "single" as const, primaryWorkspaceId: FIXTURE_WORKSPACE, primary: () => ({ fluxiq }) };

/** The `lib/fluxiq` module the routes import. */
export function fluxiqModuleMock() {
  return {
    getFluxIQ: () => fluxiq,
    getFluxIQWorkspaces: () => workspaces,
    getFluxIQWebRuntimeStatus: () => ({ automationStudio: { activeProjectId: "project-active" } }),
    setAutomationStudioWebContext: () => undefined,
    reloadFluxIQWebInstance: async () => fluxiq
  };
}

/** The `next/headers` module: the cookie is the caller's. */
export function nextHeadersMock() {
  return { cookies: async () => ({ get: () => (fixture.cookie === undefined ? undefined : { value: fixture.cookie }) }) };
}

/** A request from `caller`: its cookie is set on the fixture, its token sent as a bearer header. */
export function routeRequest(caller: RouteCaller, path: string, init: { method?: string; json?: unknown; bytes?: Uint8Array<ArrayBuffer>; mediaType?: string } = {}): NextRequest {
  fixture.cookie = caller.kind === "cookie" ? `cookie-${caller.person}` : undefined;
  const headers: Record<string, string> = caller.kind === "token" ? { authorization: `Bearer token-${caller.person}` } : {};
  if (init.json !== undefined) headers["content-type"] = "application/json";
  if (init.bytes !== undefined) {
    headers["content-type"] = init.mediaType ?? "image/png";
    headers["content-length"] = String(init.bytes.byteLength);
  }
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.bytes;
  return new NextRequest(`http://127.0.0.1${path}`, { method: init.method ?? "GET", headers, ...(body === undefined ? {} : { body }) });
}

/** The digest every asset fixture uses. */
export const FIXTURE_SHA = SHA;

/** What a route did with the call: refused it unauthenticated, refused it forbidden, or let it through. */
export async function outcome(response: Response): Promise<{ outcome: "unauthenticated" | "forbidden" | "allowed"; error?: string }> {
  if (response.status === 401) return { outcome: "unauthenticated" };
  if (response.status === 403) {
    const body = (await response.json()) as { error?: string };
    return { outcome: "forbidden", ...(body.error === undefined ? {} : { error: body.error }) };
  }
  return { outcome: "allowed" };
}

const invitee = { userId: INVITEE.id, email: "invitee@example.test", displayName: "Invitee", status: "active", emailVerifiedAtMs: null, lastSignInAtMs: null, createdAtMs: 0 };
const inviteeMembership = { workspaceId: FIXTURE_WORKSPACE, userId: INVITEE.id, status: "active", policies: ["FluxIQReadOnlyAccess"], createdAtMs: 0 };

const platformServices = {
  store: {
    getAccount: async (userId: string) => (userId === INVITEE.id ? invitee : null),
    getMembership: async (workspaceId: string, userId: string) => (workspaceId === FIXTURE_WORKSPACE && userId === INVITEE.id ? inviteeMembership : null),
    getWorkspace: async () => ({ workspaceId: FIXTURE_WORKSPACE, kind: "single" }),
    listMembershipsOfWorkspace: async () => [inviteeMembership],
    listMembershipsOfUser: async () => []
  },
  // Every operation succeeds; an invite creates the invitee.
  provisioning: { run: async () => ({ ok: true, result: { status: "created", userId: INVITEE.id } }) }
};

/** The `server/provisioning-listener` module the accounts and activity routes load once a call is allowed. */
export function provisioningListenerMock() {
  return { getPlatformServices: async () => platformServices };
}

/** The activity route's audit reader: an empty audit. */
export function platformAuditReaderMock() {
  return { platformAuditReader: async () => ({ read: async () => [] }) };
}
