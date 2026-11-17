import type { NextRequest } from "next/server";
import { operationalRouteContract } from "../../../../lib/operational-route-contract";
import { withWorkspaceRouteJson } from "../../../../lib/workspaces";

const ROUTE = operationalRouteContract("GET", "/api/framework/io").iam;

export async function GET(request: NextRequest) {
  const domainId = request.nextUrl.searchParams.get("domain");
  return withWorkspaceRouteJson(request, ROUTE, {}, ({ fluxiq }) => ({
    ok: true,
    domainId,
    io: fluxiq.ioSnapshot(domainId)
  }));
}
