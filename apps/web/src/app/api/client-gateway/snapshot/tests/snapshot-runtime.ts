import type { ClientGatewaySession, ClientGatewaySnapshotView, ClientGatewayTrustedClientView } from "fluxiq/client-gateway";
import { vi } from "vitest";
import { createWorkspacePresentations, type WorkspacePresentationOwner } from "../../../../../lib/workspaces/presentation";
import { hostFacts, instanceFixture } from "../../../../../lib/workspaces/presentation/tests/fixture";
import { resetRouteRuntime, routeRequest, runtime } from "../../../../../lib/workspaces/routes/tests/route-runtime";

type Project = { id: string; name: string; domainId: string | null; ownerUserId: string; updatedAt: number };
type Tenant = "a" | "b" | "primary";
export const snapshotRuntime = {
  primaryCurrent: true,
  owners: new Map<Tenant, WorkspacePresentationOwner>(),
  projects: new Map<Tenant, Project[]>(),
  views: new Map<Tenant, ClientGatewaySnapshotView>(),
  ready: { a: vi.fn(), b: vi.fn(), primary: vi.fn() },
  snapshots: { a: vi.fn(), b: vi.fn(), primary: vi.fn() },
  lists: { a: vi.fn(), b: vi.fn(), primary: vi.fn() },
  domains: { a: vi.fn(), b: vi.fn(), primary: vi.fn() },
  flows: { a: vi.fn(), b: vi.fn(), primary: vi.fn() }
};

export async function resetSnapshotRuntime() {
  await resetRouteRuntime();
  snapshotRuntime.primaryCurrent = true;
  vi.stubEnv("FLUXIQ_PROFILE", "service");
  snapshotRuntime.owners.clear();
  snapshotRuntime.projects.clear();
  snapshotRuntime.views.clear();
  const presentations = createWorkspacePresentations({ now: () => 100 });
  for (const [tenant, workspaceId, instance] of [["a", "tenant-a", runtime.tenantA], ["b", "tenant-b", runtime.tenantB], ["primary", "workspace-main", runtime.primary]] as const) {
    const fixture = instanceFixture(tenant);
    const studio = Object.assign(fixture.instance.programs.automationStudio, { assertProjectDomainAccess: snapshotRuntime.domains[tenant], getFlow: snapshotRuntime.flows[tenant] });
    const enriched = Object.assign(instance, { activeDomainId: `domain-${tenant}`, paths: fixture.instance.paths, programs: Object.assign(instance.programs, { automationStudio: studio }) });
    Object.assign(enriched.programs.clientGateway, { ready: snapshotRuntime.ready[tenant], snapshot: snapshotRuntime.snapshots[tenant] });
    snapshotRuntime.ready[tenant].mockResolvedValue(undefined);
    snapshotRuntime.views.set(tenant, gatewayView(tenant));
    snapshotRuntime.snapshots[tenant].mockImplementation(() => snapshotRuntime.views.get(tenant)!);
    snapshotRuntime.projects.set(tenant, [{ id: "same-project", name: `Project ${tenant}`, domainId: `domain-${tenant}`, ownerUserId: `person-${tenant}`, updatedAt: 2 }]);
    snapshotRuntime.domains[tenant].mockImplementation(async (projectId: string, domainId: string | null) => {
      if (!snapshotRuntime.projects.get(tenant)?.some(project => project.id === projectId && project.domainId === domainId)) throw new Error("Private project storage path");
    });
    snapshotRuntime.flows[tenant].mockImplementation(async (projectId: string, flowId: string) => {
      if (projectId !== "same-project" || flowId !== "same-flow") throw new Error("Private flow storage path");
      return { projectId, flowId };
    });
    snapshotRuntime.lists[tenant].mockImplementation(async () => ({ ok: true, payload: { projects: snapshotRuntime.projects.get(tenant) ?? [] } }));
    enriched.programs.api.register({ programId: "automation-studio", endpoint: "projects", permission: "programs.read", classification: "read", action: "studio:Projects", accessLevel: "Read", resource: { types: ["*"], of: () => ({ kind: "workspace" }) }, handler: snapshotRuntime.lists[tenant] });
    const owner = presentations.bind({ workspaceId, instance: enriched, runtimeId: `runtime-${tenant}`, profile: "service" });
    owner.forCaller({ userId: `person-${tenant}` }).beginContextWrite().commit({ activeProjectId: "same-project", activeFlowId: "same-flow" });
    snapshotRuntime.owners.set(tenant, owner);
  }
  runtime.presenter.mockImplementation((workspaceId, instance, caller) => {
    const selected = presentations.forInstance(workspaceId, instance)?.forCaller(caller);
    if (!selected) throw new Error("No selected presentation");
    return { context: selected.context, beginContextWrite: selected.beginContextWrite, present: () => selected.present(hostFacts) };
  });
}

export function snapshotRequest(options: Parameters<typeof routeRequest>[0] = {}) {
  return routeRequest({ url: "https://panel.example.test/api/client-gateway/snapshot?domainId=domain-a", ...options });
}

export function gatewayView(tenant: Tenant): ClientGatewaySnapshotView {
  const userId = `person-${tenant}`;
  const domainId = `domain-${tenant}`;
  const session = (sessionId: string, clientId: string, operatorUserId?: string): ClientGatewaySession => ({ sessionId, clientId, clientType: "extension", name: `Browser ${tenant}`, status: "ready", connectedAt: 1, lastSeenAt: 2, pairedAt: 1, trustedClientId: "trust-a", ...(operatorUserId ? { operatorUserId } : {}), projectId: "same-project", activeRecordingId: "same-recording", capabilities: [{ id: "capture", label: "Capture", kind: "action", actionTypes: ["click"], metadata: { private: "private-capability-metadata" } }], metadata: { domainId, private: "private-session-metadata" }, stateUpdate: { activeContextId: "private-context" } });
  const trust = (trustedClientId: string, clientId: string, approvedByUserId: string): ClientGatewayTrustedClientView => ({ trustedClientId, clientId, clientType: "extension", name: `Trusted ${tenant}`, approvedByUserId, domainId, status: "active", approvedAt: 1, createdAt: 1, updatedAt: 2, lastUsedAt: 2, expiresAt: 10000, revocationReason: "private-revocation-reason" });
  return {
    enabled: true, publicUrl: "wss://core.example.test/client",
    sessions: [session("gateway-a", "browser-a", userId), session("gateway-same-client", "browser-a", userId), session("gateway-other-client", "browser-other", userId), session("gateway-foreign", "browser-foreign", "person-foreign"), session("gateway-unowned", "browser-unowned")],
    trustedClients: [trust("trust-a", "browser-a", userId), trust("trust-other", "browser-other", userId), trust("trust-foreign", "browser-foreign", "person-foreign")],
    pairings: [{ pairingCode: "private-pairing-code", expiresAt: 10000, userId, requestedBySessionId: "gateway-a" }],
    auditLog: [{ id: "audit-one", timestamp: 1, type: "gateway.private", message: "private-audit-message", sessionId: "gateway-a", metadata: { private: "private-audit-metadata" } }]
  };
}

/** Fail on an early HTTP refusal rather than waiting for a gate the route never reached. */
export async function waitForRouteEntry(entered: Promise<void>, pending: Promise<Response>): Promise<void> {
  await Promise.race([entered, pending.then(response => { throw new Error(`Route returned HTTP ${response.status} before the expected validation wait.`); })]);
}
