import { appRouteIamContract } from "../../../../../lib/app-route-iam";
import { createEnvironment, listEnvironments, withEnvironmentsRoute } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST = appRouteIamContract("GET", "/api/platform/v1/environments");
const CREATE = appRouteIamContract("POST", "/api/platform/v1/environments");

/** The workspace's dedicated browsers and their states. */
export async function GET(request: Request): Promise<Response> {
  return withEnvironmentsRoute(request, LIST, (deps) => listEnvironments(deps));
}

/** Creates and starts a dedicated browser, admitted by the workspace's paid plan; `{ operationId, environmentId? }`. */
export async function POST(request: Request): Promise<Response> {
  return withEnvironmentsRoute(request, CREATE, async (deps) => createEnvironment(deps, await request.text()));
}
