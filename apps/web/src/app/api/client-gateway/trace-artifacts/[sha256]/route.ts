// Trace artifacts a paired client uploads for a traced command (traces and
// offline trials, P2; D13): `PUT CLIENT_GATEWAY_TRACE_ARTIFACT_PATH/<sha256>`,
// the client's bearer pairing token, `content-type` the artifact's media type.
// The bytes go to the client gateway's trace intake for the client's own
// gateway session, which records them into every open trace claiming that
// session and pins them in the trace's store. Not the state-assets route: that
// one is image-only, project- and recording-bound, and writes to the legacy
// object store a recording prune deletes from.
//
// The answer says how many traces took the artifact. None is not a failure:
// the session may not be traced, or the trace that asked may have closed.
// Neither the bytes nor the token is ever logged or echoed.

import { NextResponse } from "next/server";
import { getFluxIQ } from "../../../../../lib/fluxiq";
import { pairedClientDomainScope, readBearerToken } from "../../../../../lib/program-route";

type RouteParams = {
  params: Promise<{
    sha256: string;
  }>;
};

const MAX_TRACE_ARTIFACT_BYTES = 20 * 1024 * 1024;

/** What a page snapshot is made of: its HTML, its stylesheets, its images and its fonts. An explicit list, never a prefix. */
const ALLOWED_TRACE_ARTIFACT_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "text/html",
  "text/css",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "font/woff",
  "font/woff2",
  "font/ttf",
  "font/otf",
  "font/sfnt",
  "font/collection"
]);

export async function PUT(request: Request, context: RouteParams) {
  const { sha256 } = await context.params;
  const fluxiq = getFluxIQ();
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (!bearerToken) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const clientSession = await fluxiq.programs.clientGateway.authorizeToken(bearerToken);
  if (!clientSession) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  // The domain the pairing bound, as on the program and state-asset routes (t379).
  if (!pairedClientDomainScope(request.url, clientSession)) return NextResponse.json({ ok: false, error: "A paired client may only reach its own domain." }, { status: 403 });

  const normalizedSha = sha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedSha)) return NextResponse.json({ ok: false, error: "Invalid artifact digest" }, { status: 400 });

  const mediaType = normalizeTraceArtifactMediaType(request.headers.get("content-type"));
  if (!mediaType) return NextResponse.json({ ok: false, error: "Trace artifacts must be HTML, CSS, an image or a font." }, { status: 415 });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_TRACE_ARTIFACT_BYTES) {
    return NextResponse.json({ ok: false, error: "Trace artifact upload is too large." }, { status: 413 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) return NextResponse.json({ ok: false, error: "Trace artifact upload body is required." }, { status: 400 });
  if (bytes.byteLength > MAX_TRACE_ARTIFACT_BYTES) return NextResponse.json({ ok: false, error: "Trace artifact upload is too large." }, { status: 413 });

  const intake = fluxiq.programs.clientGateway.receiveTraceArtifact(clientSession.sessionId, { sha256: normalizedSha, mediaType, bytes });
  if (intake.status === "refused") return NextResponse.json({ ok: false, error: "Trace artifact digest does not match its bytes." }, { status: 409 });
  return NextResponse.json({ ok: true, payload: { sha256: normalizedSha, traces: intake.traces } }, { status: 200 });
}

/** The media type without parameters, lower case, when it is one a trace takes; otherwise null. */
function normalizeTraceArtifactMediaType(value: string | null): string | null {
  const mediaType = (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_TRACE_ARTIFACT_MEDIA_TYPES.has(mediaType) ? mediaType : null;
}
