import type { FluxIQDeploymentSettings } from "fluxiq/platform";
import { readOwnerClaimMarker } from "./read";

/** True while `/setup` may be used: a public profile (`self-hosted` or `service`) whose owner is not claimed yet. On `local` it never is. */
export async function isOwnerClaimOpen(settings: FluxIQDeploymentSettings, fluxiqDir: string): Promise<boolean> {
  if (settings.profile === "local") return false;
  return (await readOwnerClaimMarker(fluxiqDir)) === null;
}
