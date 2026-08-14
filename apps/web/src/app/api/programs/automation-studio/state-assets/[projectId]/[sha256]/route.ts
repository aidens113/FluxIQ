import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../../../lib/auth";
import { getFluxIQ } from "../../../../../../../lib/fluxiq";

type RouteParams = {
  params: Promise<{
    projectId: string;
    sha256: string;
  }>;
};

const MAX_STATE_ASSET_BYTES = 20 * 1024 * 1024;
const ALLOWED_UPLOAD_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function GET(_request: Request, context: RouteParams) {
  const { projectId, sha256 } = await context.params;
  const fluxiq = getFluxIQ();
  const sessionId = await readSessionId();
  if (!sessionId) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (!auth.role.permissions.includes("programs.read")) return NextResponse.json({ ok: false, error: "Permission required: programs.read" }, { status: 403 });
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
  if (!uploadAuth.ok) return NextResponse.json({ ok: false, error: uploadAuth.error }, { status: uploadAuth.status });
  const normalizedSha = sha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/i.test(normalizedSha)) return NextResponse.json({ ok: false, error: "Invalid object digest" }, { status: 400 });

  const mediaType = normalizeUploadMediaType(request.headers.get("content-type"));
  if (!mediaType) {
    return NextResponse.json({ ok: false, error: "State asset uploads must use image/png, image/jpeg, image/webp, or image/gif." }, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_STATE_ASSET_BYTES) {
    return NextResponse.json({ ok: false, error: "State asset upload is too large." }, { status: 413 });
  }

  const content = Buffer.from(await request.arrayBuffer());
  if (!content.byteLength) return NextResponse.json({ ok: false, error: "State asset upload body is required." }, { status: 400 });
  if (content.byteLength > MAX_STATE_ASSET_BYTES) {
    return NextResponse.json({ ok: false, error: "State asset upload is too large." }, { status: 413 });
  }

  try {
    const asset = await fluxiq.programs.automationStudio.writeProjectObjectAsset({
      projectId: decodedProjectId,
      ...(uploadAuth.recordingId ? { recordingId: uploadAuth.recordingId } : {}),
      content,
      mediaType,
      expectedSha256: normalizedSha
    });
    return NextResponse.json({ ok: true, payload: asset }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "State asset could not be stored.";
    const status = message.includes("digest does not match") ? 409 : message.includes("not enabled") ? 503 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

async function readSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
}

async function authorizeStateAssetUpload(
  request: Request,
  fluxiq: ReturnType<typeof getFluxIQ>,
  projectId: string
): Promise<{ ok: true; recordingId?: string } | { ok: false; status: number; error: string }> {
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (bearerToken) {
    const clientSession = await fluxiq.programs.clientGateway.authorizeToken(bearerToken);
    if (!clientSession) return { ok: false, status: 401, error: "Authentication required" };
    if (clientSession.projectId != null && clientSession.projectId !== projectId) {
      return { ok: false, status: 403, error: "Client is not authorized for this Automation Studio project." };
    }
    return { ok: true, ...(clientSession.activeRecordingId ? { recordingId: clientSession.activeRecordingId } : {}) };
  }

  const sessionId = await readSessionId();
  if (!sessionId) return { ok: false, status: 401, error: "Authentication required" };
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return { ok: false, status: 401, error: "Authentication required" };
  if (!auth.role.permissions.includes("programs.write")) return { ok: false, status: 403, error: "Permission required: programs.write" };
  return { ok: true };
}

function normalizeUploadMediaType(value: string | null): string | null {
  const mediaType = (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_UPLOAD_MEDIA_TYPES.has(mediaType) ? mediaType : null;
}

function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
