import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import type { AppRouteIamContract } from "../../../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../../../lib/workspaces";
import type { WorkspaceRouteRefusal } from "../../../../../../lib/workspaces";
import { commerceConfig, getCommerceBilling } from "../../../../../../server/commerce";
import type { CommerceRouteAnswer, CommerceRouteDeps } from "./types";

/**
 * Runs one checkout route for a signed-in panel caller, decided by its IAM
 * contract in the workspace its session works in (never one the request
 * names), and revalidated after the work, so a session that ended or lost
 * the right meanwhile gets no answer. A server that bills nothing answers
 * 404 before anything else; a misconfigured one 503 without detail.
 */
export async function withCommerceRoute(request: Request, contract: AppRouteIamContract, work: (deps: CommerceRouteDeps) => Promise<CommerceRouteAnswer>): Promise<Response> {
  let billing: Awaited<ReturnType<typeof getCommerceBilling>>;
  let config: ReturnType<typeof commerceConfig>;
  try {
    billing = await getCommerceBilling();
    config = commerceConfig();
  } catch (error) {
    console.error(`[commerce] billing is misconfigured: ${error instanceof Error ? error.message : String(error)}`);
    return json(503, { ok: false, code: "commerce.unavailable", error: "Billing is unavailable." });
  }
  if (billing === null || config === null) return json(404, { ok: false, code: "commerce.disabled", error: "This server does not bill." });
  const selected = await workspaceRouteContext(request, contract);
  if (!selected.ok) return refusal(selected);
  const context = selected.context;
  try {
    const before = await context.revalidate();
    if (!before.ok) return refusal(before);
    const { getPlatformServices } = await import("../../../../../../server/provisioning-listener");
    const { store } = await getPlatformServices();
    const answer = await work({ workspaceId: context.workspaceId, billing, config, workspaces: store, publicOrigin: resolveFluxIQDeploymentSettings(process.env).publicOrigin, now: Date.now });
    const after = await context.revalidate();
    if (!after.ok) return refusal(after);
    if (!context.current()) return refusal({ ok: false, status: 401, error: "Authentication required" });
    return json(answer.status, answer.body);
  } catch (error) {
    console.error(`[commerce] ${contract.method} ${contract.path} failed: ${error instanceof Error ? error.message : String(error)}`);
    return json(500, { ok: false, code: "commerce.failed", error: "Billing could not complete the request." });
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
