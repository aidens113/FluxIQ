import type { FluxIQ } from "fluxiq";
import { ContextRouteError } from "./failure";

/** A body clientId is a requested slot, never ownership evidence. Read only the selected gateway. */
export function requireOwnedContextClient(fluxiq: FluxIQ, userId: string, clientId?: string): void {
  if (!clientId) return;
  const owned = fluxiq.programs.clientGateway.snapshot().trustedClients.some(client => client.clientId === clientId && client.approvedByUserId === userId && client.status === "active");
  if (!owned) throw new ContextRouteError(403, "Selected client is not available to this user.");
}
