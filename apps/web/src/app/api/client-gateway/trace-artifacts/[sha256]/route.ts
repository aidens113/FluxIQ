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
import { getFluxIQ } from "../../../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, pairedClientRouteActor } from "../../../../../lib/app-route-iam";
import { pairedClientDomainScope, readBearerToken } from "../../../../../lib/program-route";

const ROUTE = appRouteIamContract("PUT", "/api/client-gateway/trace-artifacts/[sha256]");

type RouteParams = {
  params: Promise<{
    sha256: string;
  }>;
};

export async function PUT(request: Request, context: RouteParams) {
  const { sha256 } = await context.params;
  const fluxiq = getFluxIQ();
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (!bearerToken) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const clientSession = await fluxiq.programs.clientGateway.authorizeToken(bearerToken);
  if (!clientSession) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  // The domain the pairing bound, as on the program and state-asset routes (t379).
  if (!pairedClientDomainScope(request.url, clientSession)) return NextResponse.json({ ok: false, error: "A paired client may only reach its own domain." }, { status: 403 });
  // As the person who approved the pairing, on the client's own browser.
  const actor = await pairedClientRouteActor(fluxiq.programs.identityAccess, clientSession);
  if (!actor) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "paired-client", actor, { trustedClientId: clientSession.trustedClientId });
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });

  const result = await uploadTraceArtifact({ fluxiq, request, sha256, sessionId: clientSession.sessionId,
    stillAuthorized: async () => (await fluxiq.programs.clientGateway.authorizeToken(bearerToken))?.sessionId === clientSession.sessionId });
  return new Response(result.body, { status: result.status, headers: result.headers });
}
