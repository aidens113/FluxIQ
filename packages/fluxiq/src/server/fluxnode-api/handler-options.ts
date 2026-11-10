/** Tunables of the FluxNode HTTP API; the defaults are what a server uses. */
export type FluxNodeApiOptions = {
  /** The largest request body read, in bytes. Defaults to 1 MB. */
  maxBodyBytes?: number;
  /** How often a quiet event stream sends a keep-alive comment. Defaults to 15 seconds. */
  keepAliveMs?: number;
};
