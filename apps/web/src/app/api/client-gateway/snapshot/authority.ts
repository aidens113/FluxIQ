import type { WorkspaceRouteContext, WorkspaceRouteRefusal } from "../../../../lib/workspaces";
import { sameWorkspaceRouteAuthority } from "../../../../lib/workspaces/routes";

export class GatewaySnapshotRefusal extends Error {
  constructor(readonly refusal: WorkspaceRouteRefusal) {
    super(refusal.error);
    this.name = "GatewaySnapshotRefusal";
  }
}

export async function snapshotCaller(owner: WorkspaceRouteContext) {
  const current = await owner.revalidate();
  if (!current.ok) throw new GatewaySnapshotRefusal(current);
  return current.caller;
}

export async function snapshotResource(owner: WorkspaceRouteContext, projectId: string, flowId?: string | null) {
  const caller = await snapshotCaller(owner);
  const decision = await owner.fluxiq.programs.api.authorize({
    actor: caller.actor,
    permission: "programs.read",
    action: flowId ? "studio:GetFlow" : "studio:Projects",
    resources: flowId ? { kind: "project-child", projectId, child: "flow", childId: flowId } : { kind: "project", projectId }
  });
  const after = await snapshotCaller(owner);
  if (!sameWorkspaceRouteAuthority(caller, after)) throw new GatewaySnapshotRefusal({ ok: false, status: 403, error: "Request authority changed during authorization." });
  if (decision.allowed) return;
  if (decision.response.errorCode === "authorization.required") throw new GatewaySnapshotRefusal({ ok: false, status: 401, error: "Authentication required" });
  if (decision.decision?.failure === "policy_unavailable" || decision.response.errorCode !== "authorization.forbidden") throw new GatewaySnapshotRefusal({ ok: false, status: 503, error: "Request authority could not be verified." });
  throw new GatewaySnapshotRefusal({ ok: false, status: 403, error: "Selected project is not available." });
}
