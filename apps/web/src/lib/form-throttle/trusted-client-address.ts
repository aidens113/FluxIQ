import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { loginClientAddress } from "../login-attempts";

/** The client address a trusted proxy forwarded, or null: without FLUXIQ_TRUST_PROXY there is no per-client address to bound. */
export function trustedClientAddress(request: Pick<Request, "headers">): string | null {
  if (!resolveFluxIQDeploymentSettings(process.env).trustProxy) return null;
  const address = loginClientAddress(request, true);
  return address === "proxy-unknown" ? null : address;
}
