import { appRouteIamContract } from "../../../../../../../lib/app-route-iam";
import { changeEnvironment, withEnvironmentsRoute } from "../../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STOP = appRouteIamContract("POST", "/api/platform/v1/environments/[environmentId]/stop");

/** Stops one of the workspace's dedicated browsers; `{ operationId }`. */
export async function POST(request: Request, context: { params: Promise<{ environmentId: string }> }): Promise<Response> {
  const { environmentId } = await context.params;
  return withEnvironmentsRoute(request, STOP, async (deps) => changeEnvironment(deps, "stop", environmentId, await request.text()));
}
