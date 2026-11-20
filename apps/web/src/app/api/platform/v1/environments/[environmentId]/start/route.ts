import { appRouteIamContract } from "../../../../../../../lib/app-route-iam";
import { changeEnvironment, withEnvironmentsRoute } from "../../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const START = appRouteIamContract("POST", "/api/platform/v1/environments/[environmentId]/start");

/** Starts one of the workspace's dedicated browsers; `{ operationId }`. */
export async function POST(request: Request, context: { params: Promise<{ environmentId: string }> }): Promise<Response> {
  const { environmentId } = await context.params;
  return withEnvironmentsRoute(request, START, async (deps) => changeEnvironment(deps, "start", environmentId, await request.text()));
}
