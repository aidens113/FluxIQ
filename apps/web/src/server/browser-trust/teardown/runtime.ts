import type { CredentialTeardownRuntime } from "./types";

/** Hold the exact primary that supplies credential proof and platform existence, without ambient reselection. */
export async function holdCredentialTeardownRuntime(): Promise<CredentialTeardownRuntime> {
  const source = await import("../../../lib/fluxiq");
  const primary = await source.getFluxIQAfterReload();
  const manager = source.getFluxIQWorkspaces();
  const current = () => source.isCurrentFluxIQPrimary(primary) && source.getFluxIQWorkspaces() === manager;
  if (!current()) throw new Error("Credential teardown runtime is no longer current.");
  const lease = await manager.acquire(manager.primaryWorkspaceId);
  let retained = false;
  try {
    if (!current() || lease.fluxiq !== primary) throw new Error("Credential teardown runtime is no longer current.");
    retained = true;
    return { primary, manager, current, release: () => lease.release() };
  } finally {
    if (!retained) lease.release();
  }
}
