import { parseListenAddress } from "./bind";
import { ProvisioningListenerConfigError } from "./provisioning-listener-config-error";
import { startProvisioningListener } from "./start-provisioning-listener";
import type { ProvisioningListenerHandle, ProvisioningListenerOptions, ProvisioningListenerServices } from "./types";

/** Defaults the panel and the client gateway use when their port variables are unset. */
const DEFAULT_PANEL_PORT = 3000;
const DEFAULT_CLIENT_GATEWAY_PORT = 4777;

/** What a caller may override besides the environment (tests). */
export type ProvisioningListenerEnvOverrides = Pick<ProvisioningListenerOptions, "log" | "now" | "rateLimit" | "drainMs">;

/**
 * Starts the private listener from the environment, or answers null when it
 * is off. It is off unless `FLUXIQ_PROVISIONING_TOKEN_FILE` is set; then
 * `FLUXIQ_PROVISIONING_LISTEN` (`host:port`) is required, and
 * `FLUXIQ_PROVISIONING_ALLOWED_CIDRS` (a comma list) replaces the default
 * loopback and private ranges. The panel's port (`PORT`, default 3000) and the
 * client gateway's (`FLUXIQ_CLIENT_GATEWAY_PORT`, default 4777) are refused.
 */
export async function startProvisioningListenerFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  getServices: () => Promise<ProvisioningListenerServices>,
  overrides: ProvisioningListenerEnvOverrides = {}
): Promise<ProvisioningListenerHandle | null> {
  const tokenFile = env.FLUXIQ_PROVISIONING_TOKEN_FILE?.trim() ?? "";
  if (tokenFile === "") return null;
  const listenValue = env.FLUXIQ_PROVISIONING_LISTEN?.trim() ?? "";
  if (listenValue === "") throw new ProvisioningListenerConfigError("FLUXIQ_PROVISIONING_LISTEN (host:port) is required when FLUXIQ_PROVISIONING_TOKEN_FILE is set.");
  const { host, port } = parseListenAddress(listenValue);
  const options: ProvisioningListenerOptions = {
    host,
    port,
    tokenFile,
    reservedPorts: [
      { port: Number(env.PORT || DEFAULT_PANEL_PORT), owner: "the panel (PORT)" },
      { port: Number(env.FLUXIQ_CLIENT_GATEWAY_PORT || DEFAULT_CLIENT_GATEWAY_PORT), owner: "the client gateway (FLUXIQ_CLIENT_GATEWAY_PORT)" }
    ],
    getServices
  };
  const allowedCidrs = parseCidrList(env.FLUXIQ_PROVISIONING_ALLOWED_CIDRS);
  if (allowedCidrs !== null) options.allowedCidrs = allowedCidrs;
  if (overrides.log !== undefined) options.log = overrides.log;
  if (overrides.now !== undefined) options.now = overrides.now;
  if (overrides.rateLimit !== undefined) options.rateLimit = overrides.rateLimit;
  if (overrides.drainMs !== undefined) options.drainMs = overrides.drainMs;
  return startProvisioningListener(options);
}

/** The comma list's entries, or null when the variable is unset or blank (the default ranges apply). */
function parseCidrList(value: string | undefined): string[] | null {
  const entries = (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length === 0 ? null : entries;
}
