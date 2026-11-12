import type { FluxIQ } from "../../framework/index.ts";
import { managedClientAuthority } from "../managed-hosts/index.ts";
import { pairedClientDomainScope, readBearerToken, type ProgramRouteResponse } from "../program-route/index.ts";
import type { ProgramResourceRef } from "../../programs/_shared/iam/index.ts";
import { uploadTraceArtifact } from "./trace-artifact-upload.ts";
import { uploadStateAsset } from "./state-asset-upload.ts";
import { uploadResponse } from "./upload-response.ts";

/** Headless routes for an engine-enrolled browser's own current run. */
export async function handleManagedClientRequest(request: Pick<Request, "url" | "method" | "headers" | "arrayBuffer">, fluxiq: FluxIQ): Promise<ProgramRouteResponse | undefined> {
  const url = new URL(request.url);
  const path = url.pathname;
  const contextRead = path === "/api/client-gateway/snapshot" && request.method === "GET"
    || path === "/api/client-gateway/first-project" && request.method === "POST";
  const trace = /^\/api\/client-gateway\/trace-artifacts\/([^/]+)$/u.exec(path);
  const state = /^\/api\/programs\/automation-studio\/state-assets\/([^/]+)\/([^/]+)$/u.exec(path);
  if (!contextRead && !trace && !state) return undefined;
  if ([...url.searchParams.keys()].some((key) => key !== "domainId")) return uploadResponse(403, { ok: false, error: "A managed host's target comes only from its authenticated run binding." });
  if (!contextRead && request.method !== "PUT") return uploadResponse(405, { ok: false, error: "Method not allowed" });
  const token = readBearerToken(request.headers.get("authorization"));
  const session = await fluxiq.programs.clientGateway.authorizeToken(token);
  if (!session) return uploadResponse(401, { ok: false, error: "Authentication required" });
  const authority = managedClientAuthority(fluxiq, session);
  if (!authority || !pairedClientDomainScope(request.url, session)) return uploadResponse(403, { ok: false, error: "A current managed host run in this domain is required." });
  const clientResource: ProgramResourceRef = { kind: "client", clientId: session.trustedClientId };
  const allowed = async (action: string, resource: ProgramResourceRef): Promise<boolean> => {
    if (!authority.isCurrent() || (await fluxiq.programs.clientGateway.authorizeToken(token))?.sessionId !== session.sessionId) return false;
    const decision = await fluxiq.programs.api.authorize({ actor: authority.actor, action, permission: "programs.read", resources: resource });
    return decision.allowed && authority.isCurrent();
  };
  if (contextRead) {
    if (!await allowed("gateway:Snapshot", clientResource)) return uploadResponse(403, { ok: false, error: "This managed host may not read the run context." });
    return uploadResponse(200, { ok: true, payload: path.endsWith("first-project") ? { projectId: authority.projectId } : {
      managed: true,
      sessions: [{ sessionId: session.sessionId, clientId: session.clientId, managedHostId: session.managedHostId, status: session.status, projectId: authority.projectId }]
    } });
  }
  if (trace) {
    if (!await allowed("gateway:PutTraceArtifact", clientResource)) return uploadResponse(403, { ok: false, error: "This managed host may not upload trace artifacts." });
    return uploadTraceArtifact({ fluxiq, request, sha256: trace[1]!, sessionId: session.sessionId, stillAuthorized: () => allowed("gateway:PutTraceArtifact", clientResource) });
  }
  let projectId: string;
  let sha256: string;
  try {
    projectId = decodeURIComponent(state![1]!);
    sha256 = decodeURIComponent(state![2]!);
  }
  catch { return uploadResponse(400, { ok: false, error: "Malformed request path." }); }
  if (projectId !== authority.projectId) return uploadResponse(403, { ok: false, error: "A managed host may only upload to its leased project." });
  await fluxiq.programs.automationStudio.assertProjectDomainAccess(projectId, authority.domainId);
  const project: ProgramResourceRef = { kind: "project", projectId };
  if (!await allowed("studio:WriteStateAsset", project)) return uploadResponse(403, { ok: false, error: "This managed host may not upload state assets." });
  return uploadStateAsset({ fluxiq, request, projectId, sha256, clientSessionId: session.sessionId, stillAuthorized: () => allowed("studio:WriteStateAsset", project) });
}
