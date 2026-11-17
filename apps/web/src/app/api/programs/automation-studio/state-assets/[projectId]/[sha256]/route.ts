import { NextResponse } from "next/server";
import { pairedClientProjectDomainRefusal, uploadStateAsset } from "fluxiq/server";
import { appRouteIamContract, routeParamId } from "../../../../../../../lib/app-route-iam";
import { workspaceRouteContext, type WorkspaceRouteContext, type WorkspaceRouteRefusal } from "../../../../../../../lib/workspaces";

type RouteParams = {
  params: Promise<{
    projectId: string;
    sha256: string;
  }>;
};

const READ_ROUTE = appRouteIamContract("GET", "/api/programs/automation-studio/state-assets/[projectId]/[sha256]");
const WRITE_ROUTE = appRouteIamContract("PUT", "/api/programs/automation-studio/state-assets/[projectId]/[sha256]");
type AssetRefusal = WorkspaceRouteRefusal & { readonly errorCode?: string };

export async function GET(request: Request, context: RouteParams) {
  const { projectId, sha256 } = await context.params;
  const target = routeParamId(projectId);
  const selected = await workspaceRouteContext(request, READ_ROUTE, { projectId: target });
  if (!selected.ok) return refusalResponse(selected);
  const owner = selected.context;
  try {
    if (!/^[a-f0-9]{64}$/i.test(sha256)) return NextResponse.json({ ok: false, error: "Invalid object digest" }, { status: 400, headers: { "cache-control": "private, no-store" } });
    const response = await readAssetResponse(owner, target, sha256.toLowerCase());
    const current = await owner.revalidate();
    return current.ok ? response : refusalResponse(current);
  } finally {
    owner.release();
  }
}

export async function PUT(request: Request, context: RouteParams) {
  const { projectId, sha256 } = await context.params;
  const target = routeParamId(projectId);
  const selected = await workspaceRouteContext(request, WRITE_ROUTE, { projectId: target });
  if (!selected.ok) return refusalResponse(selected);
  const owner = selected.context;
  try {
    const initial = await uploadRefusal(owner, target);
    if (initial) return refusalResponse(initial);
    const binding = owner.binding;
    const gate: { refusal: AssetRefusal | null } = { refusal: null };
    const result = await uploadStateAsset({ fluxiq: owner.fluxiq, request, projectId: target, sha256,
      ...(binding.channel === "paired-client" ? { clientSessionId: binding.sessionId, ...(binding.recordingId ? { recordingId: binding.recordingId } : {}) } : {}),
      stillAuthorized: async () => {
        gate.refusal = await uploadRefusal(owner, target);
        return gate.refusal === null;
      }
    });
    // Keep Core's stale-upload 403, while preserving a specific domain refusal
    // or an unavailable authority instead of disguising either as a generic deny.
    if (gate.refusal) {
      if (gate.refusal.status === 503 || gate.refusal.errorCode) return refusalResponse(gate.refusal);
      return new Response(result.body, { status: result.status, headers: result.headers });
    }
    const current = await uploadRefusal(owner, target);
    if (current) return refusalResponse(current);
    return new Response(result.body, { status: result.status, headers: result.headers });
  } catch {
    return NextResponse.json({ ok: false, error: "State asset upload could not be completed." }, { status: 500 });
  } finally {
    owner.release();
  }
}

async function uploadRefusal(owner: WorkspaceRouteContext, projectId: string): Promise<AssetRefusal | null> {
  const current = await owner.revalidate();
  if (!current.ok) return current;
  const binding = current.caller.binding;
  if (binding.channel === "paired-client") {
    if (binding.projectId !== null && binding.projectId !== projectId) return { ok: false, status: 403, error: "Client is not authorized for this Automation Studio project." };
    const domain = await pairedClientProjectDomainRefusal(owner.fluxiq.programs.automationStudio, projectId, binding.domainId);
    if (domain) return { ...domain, status: 403 };
    const after = await owner.revalidate();
    if (!after.ok) return after;
  }
  return null;
}

async function readAssetResponse(owner: WorkspaceRouteContext, projectId: string, sha256: string): Promise<Response> {
  try {
    const asset = await owner.fluxiq.programs.automationStudio.readProjectObjectAsset(projectId, sha256);
    const body = new ArrayBuffer(asset.content.byteLength);
    new Uint8Array(body).set(asset.content);
    return new Response(body, { status: 200, headers: {
      "Content-Type": asset.mediaType,
      "Content-Length": String(asset.size),
      "Cache-Control": "private, no-store",
      "X-FluxIQ-Object-SHA256": asset.sha256
    } });
  } catch {
    return NextResponse.json({ ok: false, error: "State asset was not found or is not available." }, { status: 404, headers: { "cache-control": "private, no-store" } });
  }
}

function refusalResponse(refusal: AssetRefusal) {
  return NextResponse.json({ ok: false, error: refusal.error, ...(refusal.errorCode ? { errorCode: refusal.errorCode } : {}) }, { status: refusal.status, headers: { "cache-control": "private, no-store" } });
}
