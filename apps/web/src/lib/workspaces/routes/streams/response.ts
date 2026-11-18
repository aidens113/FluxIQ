import type { AppRouteIamContract, AppRouteResourceInput } from "../../../app-route-iam";
import { workspaceRouteContext } from "../context";
import { WorkspaceStreamOwner } from "./owner";
import type { WorkspaceStreamOptions, WorkspaceStreamPrepare } from "./types";

/** Selects once and transfers lease ownership only to a successfully constructed lazy response. */
export async function withWorkspaceRouteStream(request: Request, contract: AppRouteIamContract, resources: AppRouteResourceInput, prepare: WorkspaceStreamPrepare, options: WorkspaceStreamOptions = {}): Promise<Response> {
  const selected = await workspaceRouteContext(request, contract, resources);
  if (!selected.ok) return Response.json({ ok: false, error: selected.error }, { status: selected.status });
  return await new WorkspaceStreamOwner(selected.context, request.signal, options).response(prepare);
}
