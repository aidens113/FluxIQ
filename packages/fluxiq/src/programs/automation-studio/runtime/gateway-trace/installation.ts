import type { AutomationStudioGatewayTraceEpisodes } from "./episodes.ts";

let installed: AutomationStudioGatewayTraceEpisodes | undefined;

/**
 * The trace episodes this process records into (traces and offline trials,
 * P2), installed once by the host that builds the runtime
 * (`programs/_shared/runtime.ts`) and read where an episode opens or an input
 * arrives outside the socket (the service's build and run, the trial ports,
 * the HTTP handlers). Static, as the host lease and channel scopes are, so the
 * service needs no new member. Nothing installed -- tracing off, or a test that
 * did not install one -- every reader does nothing.
 */
export const AutomationStudioGatewayTraceInstallation = Object.freeze({
  /**
   * Installs `episodes` in place of any earlier installation and answers the
   * function that uninstalls exactly it. The newest runtime in a process is the
   * one serving: the web host abandons the domain-less instance it builds first
   * when one domain is registered (`apps/web/src/lib/fluxiq.ts`), and a reload
   * closes the old runtime before building the new. Refusing the second, as
   * this once did, left the serving runtime's gateway capturing nothing while
   * its episodes wrote empty traces through the abandoned one (lane T, P2 M).
   */
  install(episodes: AutomationStudioGatewayTraceEpisodes): () => void {
    installed = episodes;
    return () => {
      if (installed === episodes) installed = undefined;
    };
  },
  /** The installed episodes, or nothing. */
  current(): AutomationStudioGatewayTraceEpisodes | undefined {
    return installed;
  }
});
