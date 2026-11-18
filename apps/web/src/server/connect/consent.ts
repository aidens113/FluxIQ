import { createHash } from "node:crypto";
import { appRouteIamContract, authorizeAppRoute, panelRouteActor } from "../../lib/app-route-iam";
import { validateConnectApproval } from "./approval";

/** Authorize the actual cookie's person against that tenant's policy and self-user resource. */
export async function authorizeConnectConsent(sessionId: string): Promise<{ allowed: true } | { allowed: false; status: 401 | 403 }> {
  if (!sessionId) return { allowed: false, status: 401 };
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const auth = await primary.programs.identityAccess.validateSession(sessionId);
  if (!auth) return { allowed: false, status: 401 };
  const digest = createHash("sha256").update(sessionId).digest("hex");
  const approval = await validateConnectApproval(digest);
  if (!approval.allowed || approval.user.userId !== auth.user.id) return { allowed: false, status: 403 };
  const lease = await getFluxIQWorkspaces().acquire(approval.workspace.workspaceId);
  try {
    const currentAuth = await primary.programs.identityAccess.validateSession(sessionId);
    const currentApproval = await validateConnectApproval(digest);
    if (!currentAuth) return { allowed: false, status: 401 };
    if (!currentApproval.allowed || currentApproval.user.userId !== currentAuth.user.id || currentApproval.workspace.workspaceId !== lease.workspaceId) return { allowed: false, status: 403 };
    const refusal = await authorizeAppRoute(lease.fluxiq.programs.api, appRouteIamContract("POST", "/api/connect/authorize"), "panel", panelRouteActor(currentAuth));
    return refusal ? { allowed: false, status: refusal.status } : { allowed: true };
  } finally {
    lease.release();
  }
}
