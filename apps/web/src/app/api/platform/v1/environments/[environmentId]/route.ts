import { appRouteIamContract } from "../../../../../../lib/app-route-iam";
import { changeEnvironment, withEnvironmentsRoute } from "../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELETE_ONE = appRouteIamContract("DELETE", "/api/platform/v1/environments/[environmentId]");

/**
 * Deletes one of the workspace's dedicated browsers, its profile and its
 * client's trust. The operation id is the query's `operationId`: content in a
 * DELETE request has no defined meaning (RFC 9110), and proxies and clients
 * may drop it.
 */
export async function DELETE(request: Request, context: { params: Promise<{ environmentId: string }> }): Promise<Response> {
  const { environmentId } = await context.params;
  const operationId = new URL(request.url).searchParams.get("operationId");
  return withEnvironmentsRoute(request, DELETE_ONE, (deps) => changeEnvironment(deps, "delete", environmentId, JSON.stringify({ operationId })));
}
