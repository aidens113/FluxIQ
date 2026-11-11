import type { FluxIQHostLaunchRequest } from "./host-launch-request.ts";
import type { FluxIQLaunchedHost } from "./launched-host.ts";

/**
 * Starts managed browser hosts for `fluxiq dev --browsers N`. Core never names
 * an implementation: the developer names the module that provides one
 * (`--browser-host <module>` or `FLUXIQ_BROWSER_HOST`), and the engine loads it
 * into its own process.
 */
export type FluxIQHostLauncher = {
  launch(request: FluxIQHostLaunchRequest): Promise<FluxIQLaunchedHost>;
};
