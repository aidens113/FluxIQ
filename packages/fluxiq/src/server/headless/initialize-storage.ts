import type { FluxIQ } from "../../framework/index.ts";

/**
 * Readies an instance's storage for a server: a fresh root is set up as layout
 * v2, a v2 root is used as it is, and anything else (legacy v1, an unfinished
 * migration) refuses without being touched. Moved from the web panel's
 * `lib/workspaces/initialize-storage.ts`, which re-exports it as
 * `initializeFluxIQWebStorage`; its messages are the panel's, unchanged.
 */
export async function initializeFluxIQServerStorage(fluxiq: FluxIQ): Promise<void> {
  const initial = fluxiq.inspectStorage();
  if (initial.layout === "fresh") await fluxiq.setup();
  else if (initial.layout !== "v2") {
    throw new Error(`FluxIQ web runtime requires storage layout v2; found ${initial.layout}. Use the protected framework storage migration before starting the panel.`);
  }
  const ready = fluxiq.inspectStorage();
  if (ready.layout !== "v2") {
    throw new Error(`FluxIQ web runtime storage initialization did not reach layout v2; found ${ready.layout}.`);
  }
}
