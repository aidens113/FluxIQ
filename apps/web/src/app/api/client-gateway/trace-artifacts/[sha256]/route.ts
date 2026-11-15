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
import { uploadTraceArtifact } from "fluxiq/server";
import { appRouteIamContract } from "../../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../../lib/workspaces/routes";
import { createTraceUploadGuard } from "./guard";

const ROUTE = appRouteIamContract("PUT", "/api/client-gateway/trace-artifacts/[sha256]");

type RouteParams = {
  params: Promise<{
    sha256: string;
  }>;
};

export async function PUT(request: Request, context: RouteParams) {
  const selected = await workspaceRouteContext(request, ROUTE, selection => ({ trustedClientId: selection.caller.binding.channel === "paired-client" ? selection.caller.binding.trustedClientId : undefined }));
  if (!selected.ok) return refused(selected);
  const owner = selected.context;
  try {
    let sha256: unknown;
    try {
      sha256 = (await context.params)?.sha256;
    } catch {
      return refused({ status: 400, error: "Invalid artifact digest" });
    }
    const initial = await owner.revalidate();
    if (!initial.ok) return refused(initial);
    if (typeof sha256 !== "string") return refused({ status: 400, error: "Invalid artifact digest" });
    if (initial.caller.binding.channel !== "paired-client") return refused({ status: 403, error: "A paired client is required." });
    const guard = createTraceUploadGuard(owner, request.url);
    const result = await uploadTraceArtifact({ fluxiq: owner.fluxiq, request, sha256, sessionId: initial.caller.binding.sessionId, stillAuthorized: guard.stillAuthorized, beforeIntake: guard.beforeIntake });
    const authorization = guard.refusal();
    if (authorization?.status === 503) return refused(authorization);
    const response = new Response(result.body, { status: result.status, headers: { ...result.headers, "cache-control": "private, no-store" } });
    // Validation/stale-upload errors retain Core's existing status and text.
    if (result.status >= 400) return response;
    const current = await owner.revalidate();
    if (!current.ok) return refused(current);
    if (!owner.current()) return refused({ status: 401, error: "Authentication required" });
    return response;
  } catch {
    if (!owner.current()) return refused({ status: 401, error: "Authentication required" });
    return refused({ status: 500, error: "Trace artifact upload could not be completed." });
  } finally {
    owner.release();
  }
}

function refused(refusal: { status: number; error: string }) {
  return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status, headers: { "cache-control": "private, no-store" } });
}
