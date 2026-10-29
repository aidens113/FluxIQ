import type { PlatformServices } from "fluxiq/platform";

/** What the listener uses of the platform services: the operations and the website's service-identity caller. */
export type ProvisioningListenerServices = Pick<PlatformServices, "provisioning" | "provisionerCaller">;

/** A port another listener of this server owns, which the provisioning listener must never share. */
export type ProvisioningListenerReservedPort = {
  port: number;
  /** Who owns it, for the refusal message: "the panel (PORT)". */
  owner: string;
};

/** The per-source request budget: at most `limit` requests in any `windowMs`. */
export type ProvisioningListenerRateLimit = {
  limit: number;
  windowMs: number;
};

export type ProvisioningListenerOptions = {
  host: string;
  /** 0 picks a free port (tests). */
  port: number;
  /** One or two tokens, one per line, each at least 32 bytes. */
  tokenFile: string;
  /** The ports of the panel and the client gateway; the listener refuses to bind any of them. */
  reservedPorts: readonly ProvisioningListenerReservedPort[];
  /** Source CIDRs allowed to call; every one must be loopback or private. Defaults to `DEFAULT_ALLOWED_CIDRS`. */
  allowedCidrs?: readonly string[];
  /** Resolved per request, so a reloaded FluxIQ instance is used without a restart. */
  getServices(): Promise<ProvisioningListenerServices>;
  /** Defaults to 120 requests per minute per source. */
  rateLimit?: ProvisioningListenerRateLimit;
  /** One line per request (operation, status, error code, duration), and the token-reload warning. Defaults to `console.info`. */
  log?: (line: string) => void;
  /** The clock for the rate limit and the token-file recheck. */
  now?: () => number;
  /** How long `close()` waits for requests in flight before cutting their connections. Defaults to 10 s. */
  drainMs?: number;
};

export type ProvisioningListenerHandle = {
  address: { host: string; port: number };
  /** Stops accepting, lets requests in flight finish (up to `drainMs`), then resolves. */
  close(): Promise<void>;
};
