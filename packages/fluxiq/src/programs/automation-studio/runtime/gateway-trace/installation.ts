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
  /** Installs `episodes` and answers the function that uninstalls exactly it. Refuses a second installation. */
  install(episodes: AutomationStudioGatewayTraceEpisodes): () => void {
    if (installed !== undefined) throw new Error("gateway_trace.already_installed");
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
