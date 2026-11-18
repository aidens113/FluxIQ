import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handleProgramRequest, isPairedClientClassification, isPairedClientEndpoint, readBearerToken, type ProgramRouteResponse } from "fluxiq/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../lib/session-cookie";
import { workspaceProgramContext } from "../../../../../lib/workspaces";
import { getFluxIQWorkspaces } from "../../../../../lib/fluxiq";

type RouteParams = {
  params: Promise<{
    programId: string;
    endpoint: string;
  }>;
};

/**
 * The program route. Who a request speaks for (the panel's login cookie, or a
 * paired client's bearer token on the endpoints it allowlists), the drain
 * refusal, a token call's narrowing and domain gate, and the answer are Core's
 * (`fluxiq/server`, `handleProgramRequest`), which a server without Next.js
 * mounts too. This route holds the caller's data workspace for the whole
 * response; only single-root hosts add the existing web runtime presenter.
 */
export async function GET(request: Request, context: RouteParams) {
  return answer(request, context, "GET");
}

export async function POST(request: Request, context: RouteParams) {
  return answer(request, context, "POST");
}

async function answer(request: Request, context: RouteParams, method: "GET" | "POST"): Promise<NextResponse> {
  const { programId, endpoint } = await context.params;
  const cookieStore = await cookies();
  const manager = getFluxIQWorkspaces();
  // Reject disallowed token endpoints before proof lookup can reveal token validity or open any tenant.
  if (manager.tenancy === "multi" && !cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value && readBearerToken(request.headers.get("authorization"))) {
    const classification = manager.primary().fluxiq.programs.api.endpoints().find((entry) => entry.programId === programId && entry.endpoint === endpoint)?.classification;
    if (!isPairedClientEndpoint(programId, endpoint) || !isPairedClientClassification(classification, programId, endpoint)) return NextResponse.json({ ok: false, error: "This endpoint is not available to a paired client." }, { status: 403 });
  }
  const selected = await workspaceProgramContext({ cookies: cookieStore, headers: request.headers, signal: request.signal });
  if (!selected) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  try {
    const answered = await handleProgramRequest({
      method,
      url: request.url,
      programId,
      endpoint,
      sessionId: selected.sessionId,
      authorization: selected.authorization,
      readJson: () => request.json().catch(() => undefined),
    }, selected.context);
    return toNextResponse(answered);
  } finally {
    selected.release();
  }
}

function toNextResponse(answered: ProgramRouteResponse): NextResponse {
  return new NextResponse(answered.body, { status: answered.status, headers: answered.headers });
}
