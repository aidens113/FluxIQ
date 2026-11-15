import { createHash } from "node:crypto";
import { ClientGatewayService, type ClientGatewaySession, type ClientGatewaySnapshotView, type ClientGatewayTrustedClientView } from "fluxiq/client-gateway";
import { drainState } from "fluxiq/server";
import { vi } from "vitest";
import type { MockInstance } from "vitest";
import { resetRouteRuntime, routeRequest, runtime } from "../../../../../../lib/workspaces/routes/tests/route-runtime";

export const BODY = new TextEncoder().encode("<!doctype html><p>trace route fixture</p>");
export const SHA = createHash("sha256").update(BODY).digest("hex");
type Tenant = "a" | "b" | "primary";
const nodeGateways: ClientGatewayService[] = [];
export const traceRuntime = {
  primaryCurrent: true,
  sessions: new Map<Tenant, ClientGatewaySession>(),
  views: new Map<Tenant, ClientGatewaySnapshotView>(),
  gateways: new Map<Tenant, ClientGatewayService>(),
  tokens: new Map<string, Tenant>(),
  proofCurrent: new Map<Tenant, boolean>(),
  intakes: new Map<Tenant, MockInstance<ClientGatewayService["receiveTraceArtifact"]>>(),
  afterAuthorization: null as (() => void) | null
};

export async function resetTraceRuntime() {
  await resetRouteRuntime();
  drainState.reset();
  traceRuntime.primaryCurrent = true;
  traceRuntime.afterAuthorization = null;
  traceRuntime.sessions.clear();
  traceRuntime.views.clear();
  traceRuntime.gateways.clear();
  traceRuntime.tokens.clear();
  traceRuntime.proofCurrent.clear();
  traceRuntime.intakes.clear();
  for (const [tenant, instance] of [["a", runtime.tenantA], ["b", runtime.tenantB], ["primary", runtime.primary]] as const) {
    const userId = tenant === "b" ? "person-b" : "person-a";
    const domainId = tenant === "b" ? "domain-b" : "domain-a";
    const session: ClientGatewaySession = { sessionId: "same-session", clientId: "same-client", clientType: "extension", name: "Trace fixture browser", status: "ready", connectedAt: 1, lastSeenAt: 2, trustedClientId: "same-trust", operatorUserId: userId, projectId: "same-project", activeRecordingId: "same-recording", metadata: { domainId }, capabilities: [] };
    const trust: ClientGatewayTrustedClientView = { trustedClientId: "same-trust", clientId: "same-client", clientType: "extension", name: "Trace fixture trust", approvedByUserId: userId, domainId, approvedAt: 1, createdAt: 1, updatedAt: 2, lastUsedAt: 2, expiresAt: Date.now() + 60_000, status: "active" };
    traceRuntime.sessions.set(tenant, session);
    traceRuntime.views.set(tenant, { enabled: true, sessions: [session], trustedClients: [trust], pairings: [], auditLog: [] });
    traceRuntime.tokens.set(`trace-${tenant}`, tenant);
    traceRuntime.proofCurrent.set(tenant, true);
    const gateway = new ClientGatewayService();
    nodeGateways.push(gateway);
    traceRuntime.gateways.set(tenant, gateway);
    vi.spyOn(gateway, "authorizeToken").mockImplementation(async token => traceRuntime.tokens.get(token ?? "") === tenant ? traceRuntime.sessions.get(tenant) ?? null : null);
    vi.spyOn(gateway, "snapshot").mockImplementation(() => traceRuntime.views.get(tenant)!);
    traceRuntime.intakes.set(tenant, vi.spyOn(gateway, "receiveTraceArtifact"));
    Object.assign(instance.programs, { clientGateway: gateway });
  }
  runtime.resolveBrowser.mockImplementation(async (token: string) => {
    const tenant = traceRuntime.tokens.get(token);
    if (tenant !== "a" && tenant !== "b") return null;
    const workspaceId = `tenant-${tenant}`;
    const userId = traceRuntime.sessions.get(tenant)?.operatorUserId;
    if (!userId) return null;
    const current = () => traceRuntime.proofCurrent.get(tenant) === true && runtime.accounts.get(userId)?.status === "active" && runtime.accounts.get(userId)?.deletion === null && runtime.workspaces.has(workspaceId) && runtime.memberships.get(userId)?.some(member => member.workspaceId === workspaceId && member.status === "active") === true;
    if (!current()) return null;
    return { lease: { workspaceId, fluxiq: tenant === "a" ? runtime.tenantA : runtime.tenantB, release: runtime.releases[tenant] }, revalidateAuthority: async () => current() };
  });
}

export async function closeTraceRuntime() {
  traceRuntime.afterAuthorization = null;
  drainState.reset();
  await Promise.all(nodeGateways.splice(0).map(gateway => gateway.close()));
  vi.unstubAllEnvs();
}

export function registerTraceGateway(tenant: Tenant, gateway: ClientGatewayService, token: string) {
  const instance = tenant === "a" ? runtime.tenantA : tenant === "b" ? runtime.tenantB : runtime.primary;
  nodeGateways.push(gateway);
  traceRuntime.gateways.set(tenant, gateway);
  traceRuntime.tokens.set(token, tenant);
  vi.spyOn(gateway, "authorizeToken");
  traceRuntime.intakes.set(tenant, vi.spyOn(gateway, "receiveTraceArtifact"));
  Object.assign(instance.programs, { clientGateway: gateway });
}

export function uploadRequest(options: { token?: string | null; cookie?: string | null; sha256?: string; mediaType?: string; body?: Uint8Array<ArrayBuffer>; contentLength?: string; query?: string; signal?: AbortSignal } = {}) {
  const sha256 = options.sha256 ?? SHA;
  const body = options.body ?? BODY;
  const token = options.token === undefined ? "trace-a" : options.token;
  const base = routeRequest({ cookie: options.cookie === undefined ? null : options.cookie, ...(token ? { bearer: token } : {}), url: `https://panel.example.test/api/client-gateway/trace-artifacts/${sha256}${options.query ?? "?domainId=domain-a"}`, ...(options.signal ? { signal: options.signal } : {}) });
  const headers = new Headers(base.headers);
  headers.set("content-type", options.mediaType ?? "text/html; charset=utf-8");
  headers.set("content-length", options.contentLength ?? String(body.byteLength));
  return new Request(base, { method: "PUT", headers, body });
}

export async function waitForEntry(entered: Promise<void>, pending: Promise<Response>): Promise<void> {
  await Promise.race([entered, pending.then(response => { throw new Error(`Upload returned HTTP ${response.status} before the expected validation wait.`); })]);
}
