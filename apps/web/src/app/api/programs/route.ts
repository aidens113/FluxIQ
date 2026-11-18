import type { NextRequest } from "next/server";
import { programDirectorySchema } from "fluxiq";
import { appRouteIamContract } from "../../../lib/app-route-iam";
import { withWorkspaceRouteJson } from "../../../lib/workspaces";

const ROUTE = appRouteIamContract("GET", "/api/programs");

export async function GET(request: NextRequest) {
  const domainId = request.nextUrl.searchParams.get("domain");
  return withWorkspaceRouteJson(request, ROUTE, {}, ({ fluxiq }) => programDirectorySchema.parse(fluxiq.programDirectory(domainId)));
}
