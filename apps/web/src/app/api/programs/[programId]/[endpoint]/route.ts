import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handleProgramRequest, type ProgramRouteResponse } from "fluxiq/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../../lib/fluxiq";

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
 * mounts too. This route reads the cookie and adds the web runtime's status
 * to a signed-in person's `client-gateway-snapshot`.
 */
export async function GET(request: Request, context: RouteParams) {
  return answer(request, context, "GET");
}

export async function POST(request: Request, context: RouteParams) {
  return answer(request, context, "POST");
}

async function answer(request: Request, context: RouteParams, method: "GET" | "POST"): Promise<NextResponse> {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const answered = await handleProgramRequest({
    method,
    url: request.url,
    programId,
    endpoint,
    sessionId: await readSessionId(),
    authorization: request.headers.get("authorization"),
    readJson: () => request.json().catch(() => undefined),
  }, { fluxiq, webRuntimeStatus: getFluxIQWebRuntimeStatus });
  return toNextResponse(answered);
}

function toNextResponse(answered: ProgramRouteResponse): NextResponse {
  return new NextResponse(answered.body, { status: answered.status, headers: answered.headers });
}

async function readSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
}
