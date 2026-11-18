import { vi } from "vitest";
import type { ClientGatewaySession } from "../../../client-gateway/index.ts";
import type { FluxIQ } from "../../../framework/index.ts";
import type { ProgramApiActor } from "../../../programs/_shared/api.ts";
import type { ProgramRouteContext, ProgramRouteRequest } from "../handle-program-request.ts";
import type { ProgramRouteIdentityAuthority } from "../identity-authority.ts";

export const COOKIE = "fixture-cookie";
export const TOKEN = "fixture-browser-token";
const PERMISSIONS: ProgramApiActor["permissions"] = ["programs.read", "programs.write", "identity.manage"];

export function panelAuth(userId = "person-one", permissions = PERMISSIONS, roleId = "member") {
  return { user: { id: userId }, role: { id: roleId, permissions }, session: { expiresAtMs: Date.now() + 60_000 } };
}

export function authorityHarness() {
  const session: ClientGatewaySession = {
    sessionId: "gateway-session-one", clientId: "client-one", clientType: "extension", name: "Fixture client", status: "ready",
    connectedAt: 1, lastSeenAt: 1, trustedClientId: "trust-one", operatorUserId: "person-one", projectId: "project-one",
    metadata: { domainId: "domain-one" }, capabilities: []
  };
  const state: {
    eligible: boolean;
    auth: ReturnType<typeof panelAuth> | null;
    session: ClientGatewaySession | null;
    users: Array<{ id: string; roleId: string; enabled: boolean }>;
    roles: Array<{ id: string; permissions: string[] }>;
    classification: string;
    run: { projectId: string; domainId: string; runId: string; lease: { resourceKey: string; epoch: number } } | undefined;
  } = {
    eligible: true,
    auth: panelAuth(),
    session,
    users: [{ id: "person-one", roleId: "member", enabled: true }],
    roles: [{ id: "member", permissions: [...PERMISSIONS] }],
    classification: "read",
    run: undefined
  };
  const authority: ProgramRouteIdentityAuthority = {
    validateSession: vi.fn(async (id: string) => id === COOKIE ? state.auth : null),
    snapshot: vi.fn(async () => ({ users: state.users, roles: state.roles }))
  };
  const authorizeToken = vi.fn(async (token: string) => token === TOKEN ? state.session : null);
  const call = vi.fn(async (_input: { actor?: ProgramApiActor; payload?: unknown; scope?: { domainId?: string | null } }) => ({ ok: true, payload: { flow: { flowId: "flow-one", metadata: {} }, keys: [] } }));
  const present = vi.fn(async () => undefined);
  const domain = vi.fn(async (_projectId: string, _domainId?: string | null): Promise<void> => undefined);
  const currentRun = vi.fn(() => state.run);
  const fluxiq = {
    programs: {
      identityAccess: { validateSession: vi.fn(), snapshot: vi.fn() },
      secretKeys: { credentialUnlocks: { presentPanelSession: present } },
      clientGateway: { authorizeToken, managedHosts: { currentRun } },
      automationStudio: { assertProjectDomainAccess: domain },
      api: {
        call,
        endpoints: () => [
          { programId: "secret-keys", endpoint: "snapshot", classification: state.classification },
          { programId: "automation-studio", endpoint: "get-flow-metadata-detail", classification: state.classification },
          { programId: "automation-studio", endpoint: "get-recording-capture-policy", classification: state.classification }
        ]
      }
    }
  } as unknown as FluxIQ;
  const guard = vi.fn(async () => state.eligible);
  const context: ProgramRouteContext = { fluxiq, identityAuthority: authority, revalidateAuthority: guard };
  const request = (overrides: Partial<ProgramRouteRequest> = {}): ProgramRouteRequest => ({
    method: "POST",
    url: "https://panel.example.test/api/programs/automation-studio/get-flow-metadata-detail",
    programId: "automation-studio",
    endpoint: "get-flow-metadata-detail",
    sessionId: COOKIE,
    authorization: null,
    readJson: vi.fn(async () => ({ projectId: "project-one", flowId: "flow-one" })),
    ...overrides
  });
  return { state, authority, authorizeToken, call, present, domain, currentRun, guard, context, request };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}
