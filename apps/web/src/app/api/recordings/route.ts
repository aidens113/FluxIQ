import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, pairedClientRouteActor, panelRouteActor, type AppRouteRefusal } from "../../../lib/app-route-iam";
import { pairedClientDomainScope } from "../../../lib/program-route";

const ROUTE = appRouteIamContract("GET", "/api/recordings");

// The recordings list. A signed-in person's cookie lists as before. A paired
// client's token lists only the recordings of projects in the domain its
// pairing bound (t379), and is refused when the URL names another domain.
export async function GET(request: Request) {
  const fluxiq = getFluxIQ();
  const caller = await authorize(request, fluxiq);
  if (caller.kind === "refused") return NextResponse.json({ ok: false, error: caller.error }, { status: caller.status });

  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? undefined;
  const pageSize = url.searchParams.get("pageSize") ?? undefined;
  const payload = await fluxiq.programs.automationStudio.listRecordingSummaries({ page, pageSize, ...(caller.kind === "paired-client" ? { domainId: caller.domainId } : {}) });
  return NextResponse.json(payload);
}

type Caller =
  | { kind: "person" }
  | { kind: "paired-client"; domainId: string | null }
  | ({ kind: "refused" } & AppRouteRefusal);

async function authorize(request: Request, fluxiq: ReturnType<typeof getFluxIQ>): Promise<Caller> {
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  const session = bearerToken ? await fluxiq.programs.clientGateway.authorizeToken(bearerToken) : null;
  if (session) {
    const scope = pairedClientDomainScope(request.url, session);
    if (!scope) return { kind: "refused", status: 403, error: "A paired client may only reach its own domain." };
    const actor = await pairedClientRouteActor(fluxiq.programs.identityAccess, session);
    if (!actor) return { kind: "refused", status: 401, error: "Authentication required" };
    const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "paired-client", actor);
    return refusal ? { kind: "refused", ...refusal } : { kind: "paired-client", domainId: scope.domainId };
  }
  const auth = await requireFluxIQUser();
  if (!auth) return { kind: "refused", status: 401, error: "Authentication required" };
  const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "panel", panelRouteActor(auth));
  return refusal ? { kind: "refused", ...refusal } : { kind: "person" };
}

function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
