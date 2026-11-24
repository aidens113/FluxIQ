import type { AppRouteIamContract } from "../../../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../../../lib/workspaces";
import type { WorkspaceRouteRefusal } from "../../../../../../lib/workspaces";
import { getPlatformEnvironmentStore } from "../../../../../../server/environments";
import { getHostedEnvironmentController } from "../../../../../../server/environments/hosted";
import type { EnvironmentRouteAnswer, EnvironmentRouteDeps } from "./types";

/**
 * Runs one environment route for a signed-in panel caller, decided by its IAM
 * contract in the workspace its session works in (never one the request
 * names), and revalidated after the work, so a session that ended or lost the
 * right meanwhile gets no answer. A server with no hosted environments (it
 * bills nothing) answers 404 before anything else; a misconfigured one 503
 * without detail. A driver failure is 503: the operation is recorded, and
 * repeating it with the same operation id finishes it.
 */
export async function withEnvironmentsRoute(request: Request, contract: AppRouteIamContract, work: (deps: EnvironmentRouteDeps) => Promise<EnvironmentRouteAnswer>): Promise<Response> {
  let controller: Awaited<ReturnType<typeof getHostedEnvironmentController>>;
  try {
    controller = await getHostedEnvironmentController();
  } catch (error) {
    console.error(`[environments] hosted environments are misconfigured: ${error instanceof Error ? error.message : String(error)}`);
    return json(503, { ok: false, code: "environments.unavailable", error: "Dedicated browsers are unavailable." });
  }
  if (controller === null) return json(404, { ok: false, code: "environments.disabled", error: "This server has no dedicated browsers." });
  const selected = await workspaceRouteContext(request, contract);
  if (!selected.ok) return refusal(selected);
  const context = selected.context;
  try {
    const before = await context.revalidate();
    if (!before.ok) return refusal(before);
    const environments = await getPlatformEnvironmentStore();
    const answer = await work({ workspaceId: context.workspaceId, actor: context, controller, environments });
    const after = await context.revalidate();
    if (!after.ok) return refusal(after);
    if (!context.current()) return refusal({ ok: false, status: 401, error: "Authentication required" });
    return json(answer.status, answer.body);
  } catch (error) {
    console.error(`[environments] ${contract.method} ${contract.path} failed: ${error instanceof Error ? error.message : String(error)}`);
    return json(503, { ok: false, code: "environments.failed", error: "The dedicated browser could not be changed. Repeat the request with the same operationId to finish it." });
  } finally {
    context.release();
  }
}

function refusal(refused: WorkspaceRouteRefusal): Response {
  return json(refused.status, { ok: false, code: refused.status === 401 ? "unauthenticated" : refused.status === 403 ? "forbidden" : "temporarily_unavailable", error: refused.error });
}

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
