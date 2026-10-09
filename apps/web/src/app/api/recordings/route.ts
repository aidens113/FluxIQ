import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";
import { pairedClientDomainScope } from "../../../lib/program-route";

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
  | { kind: "refused"; status: 401 | 403; error: string };

async function authorize(request: Request, fluxiq: ReturnType<typeof getFluxIQ>): Promise<Caller> {
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  const session = bearerToken ? await fluxiq.programs.clientGateway.authorizeToken(bearerToken) : null;
  if (session) {
    const scope = pairedClientDomainScope(request.url, session);
    return scope ? { kind: "paired-client", domainId: scope.domainId } : { kind: "refused", status: 403, error: "A paired client may only reach its own domain." };
  }
  return await requireFluxIQUser() ? { kind: "person" } : { kind: "refused", status: 401, error: "Authentication required" };
}

function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
