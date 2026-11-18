import type { EnvironmentEnrolmentRoutes, EnvironmentStore } from "fluxiq/platform";
import type { WorkspaceLease } from "../../lib/workspaces";
import { environmentLive } from "./environment-live";
import type { EnvironmentWorkspaceAcquire } from "./types";

/**
 * Routes a hello that presents an enrolment ticket to the one tenant whose
 * gateway minted it, while its environment is recorded there as running.
 * The route comes from the ticket alone, never from anything else the client
 * said; a ticket the table does not know routes nowhere. The tenant's gateway
 * then redeems it, once.
 */
export async function resolveEnvironmentEnrolmentRoute(input: { ticket: string; signal: AbortSignal }, deps: {
  routes: Pick<EnvironmentEnrolmentRoutes, "lookup">;
  store: Pick<EnvironmentStore, "get">;
  primaryWorkspaceId: string;
  acquire: EnvironmentWorkspaceAcquire;
}): Promise<{ gateway: WorkspaceLease["fluxiq"]["programs"]["clientGateway"]; release(): void } | null> {
  const { signal } = input;
  const destination = deps.routes.lookup(input.ticket);
  if (destination === null || signal.aborted || destination.workspaceId === deps.primaryWorkspaceId) return null;
  const live = () => environmentLive(deps.store, destination.workspaceId, destination.environmentId);
  if (!await live() || signal.aborted) return null;
  const lease = await deps.acquire(destination.workspaceId);
  let retained = false;
  try {
    if (signal.aborted || lease.workspaceId !== destination.workspaceId || !await live() || signal.aborted) return null;
    const route = { gateway: lease.fluxiq.programs.clientGateway, release: () => lease.release() };
    retained = true;
    return route;
  } finally {
    if (!retained) lease.release();
  }
}
