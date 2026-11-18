import { appRouteIamContract } from "../../../lib/app-route-iam";
import { withWorkspaceRouteJson } from "../../../lib/workspaces";

const ROUTE = appRouteIamContract("GET", "/api/recordings");

/** Panel lists its selected tenant; paired clients retain their approved domain. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? undefined;
  const pageSize = url.searchParams.get("pageSize") ?? undefined;
  return withWorkspaceRouteJson(request, ROUTE, {}, ({ fluxiq }, caller) => fluxiq.programs.automationStudio.listRecordingSummaries({
    page,
    pageSize,
    ...(caller.binding.channel === "paired-client" ? { domainId: caller.binding.domainId } : {})
  }));
}
