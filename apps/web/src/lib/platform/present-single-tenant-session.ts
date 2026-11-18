import { presentPanelSession } from "fluxiq/server";
import { getFluxIQ, getFluxIQWorkspaces } from "../fluxiq";

/**
 * Opens a signed-in person's stored credentials for the panel session, only
 * under single tenancy where the primary instance is the person's workspace.
 * Under multi tenancy it does nothing: the program route and sign-in present
 * to the session's own workspace. No unlock step gates model access.
 */
export async function presentSingleTenantPanelSession(sessionId: string, auth: { user: { id: string }; session: { expiresAtMs: number } }): Promise<void> {
  if (getFluxIQWorkspaces().tenancy !== "single") return;
  await presentPanelSession(getFluxIQ(), sessionId, auth);
}
