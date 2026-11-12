import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../../../lib/auth";
import { getFluxIQ } from "../../../../../../../lib/fluxiq";
import { pairedClientProjectDomainRefusal } from "../../../../../../../lib/paired-client-project-domain";
import { appRouteIamContract, authorizeAppRoute, pairedClientRouteActor, panelRouteActor, routeParamId } from "../../../../../../../lib/app-route-iam";
import { pairedClientDomainScope } from "../../../../../../../lib/program-route";
import { uploadStateAsset } from "fluxiq/server";

type RouteParams = {
  params: Promise<{
    projectId: string;
    sha256: string;
  }>;
};

const READ_ROUTE = appRouteIamContract("GET", "/api/programs/automation-studio/state-assets/[projectId]/[sha256]");
const WRITE_ROUTE = appRouteIamContract("PUT", "/api/programs/automation-studio/state-assets/[projectId]/[sha256]");


export async function GET(_request: Request, context: RouteParams) {
  const { projectId, sha256 } = await context.params;
  const fluxiq = getFluxIQ();
  const sessionId = await readSessionId();
  if (!sessionId) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const refusal = await authorizeAppRoute(fluxiq.programs.api, READ_ROUTE, "panel", panelRouteActor({ session: { id: sessionId }, user: auth.user, role: auth.role }), { projectId: routeParamId(projectId) });
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  if (!/^[a-f0-9]{64}$/i.test(sha256)) return NextResponse.json({ ok: false, error: "Invalid object digest" }, { status: 400 });
  try {
    const asset = await fluxiq.programs.automationStudio.readProjectObjectAsset(decodeURIComponent(projectId), sha256.toLowerCase());
    const body = new ArrayBuffer(asset.content.byteLength);
    new Uint8Array(body).set(asset.content);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": asset.mediaType,
        "Content-Length": String(asset.size),
        "Cache-Control": "private, immutable, max-age=31536000",
        "X-FluxIQ-Object-SHA256": asset.sha256
      }
    });
  } catch {
    return NextResponse.json({ ok: false, error: "State asset was not found or is not available." }, { status: 404 });
  }
}

export async function PUT(request: Request, context: RouteParams) {
  const { projectId, sha256 } = await context.params;
  const decodedProjectId = decodeURIComponent(projectId);
  const fluxiq = getFluxIQ();
  const uploadAuth = await authorizeStateAssetUpload(request, fluxiq, decodedProjectId);
  if (!uploadAuth.ok) return NextResponse.json({ ok: false, error: uploadAuth.error, ...(uploadAuth.errorCode ? { errorCode: uploadAuth.errorCode } : {}) }, { status: uploadAuth.status });
  const result = await uploadStateAsset({ fluxiq, request, projectId: decodedProjectId, sha256, ...uploadAuth,
    stillAuthorized: async () => (await authorizeStateAssetUpload(request, fluxiq, decodedProjectId)).ok });
  return new Response(result.body, { status: result.status, headers: result.headers });
}

async function readSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
}

async function authorizeStateAssetUpload(
  request: Request,
  fluxiq: ReturnType<typeof getFluxIQ>,
  projectId: string
): Promise<{ ok: true; recordingId?: string; clientSessionId?: string } | { ok: false; status: number; error: string; errorCode?: string }> {
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (bearerToken) {
    const clientSession = await fluxiq.programs.clientGateway.authorizeToken(bearerToken);
    if (!clientSession) return { ok: false, status: 401, error: "Authentication required" };
    if (clientSession.projectId != null && clientSession.projectId !== projectId) {
      return { ok: false, status: 403, error: "Client is not authorized for this Automation Studio project." };
    }
    // The project must also be in the domain the pairing bound (t379), as on the program route.
    const scope = pairedClientDomainScope(request.url, clientSession);
    if (!scope) return { ok: false, status: 403, error: "A paired client may only reach its own domain." };
    const refusal = await pairedClientProjectDomainRefusal(fluxiq.programs.automationStudio, projectId, scope.domainId);
    if (refusal) return { ok: false, status: 403, error: refusal.error, errorCode: refusal.errorCode };
    const actor = await pairedClientRouteActor(fluxiq.programs.identityAccess, clientSession);
    if (!actor) return { ok: false, status: 401, error: "Authentication required" };
    const denied = await authorizeAppRoute(fluxiq.programs.api, WRITE_ROUTE, "paired-client", actor, { projectId });
    if (denied) return { ok: false, ...denied };
    return { ok: true, clientSessionId: clientSession.sessionId, ...(clientSession.activeRecordingId ? { recordingId: clientSession.activeRecordingId } : {}) };
  }

  const sessionId = await readSessionId();
  if (!sessionId) return { ok: false, status: 401, error: "Authentication required" };
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return { ok: false, status: 401, error: "Authentication required" };
  const denied = await authorizeAppRoute(fluxiq.programs.api, WRITE_ROUTE, "panel", panelRouteActor({ session: { id: sessionId }, user: auth.user, role: auth.role }), { projectId });
  if (denied) return { ok: false, ...denied };
  return { ok: true };
}

function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
