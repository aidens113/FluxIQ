import { PLATFORM_PROVISIONING_HTTP_PATH_PREFIX } from "@fluxiq/contracts/platform";
import { AccountsTransportError } from "./transport-error.ts";

/** `http://<listen>/provisioning/<operation>` for a `host:port`; a wildcard bind address means loopback for the client. */
export function provisioningListenerUrl(listen: string, operation: string): string {
  const split = listen.lastIndexOf(":");
  const rawHost = split === -1 ? "" : listen.slice(0, split).replace(/^\[|\]$/gu, "");
  const port = split === -1 ? "" : listen.slice(split + 1);
  if (!/^\d{1,5}$/u.test(port) || rawHost === "") throw new AccountsTransportError("FLUXIQ_PROVISIONING_LISTEN must be host:port");
  const host = rawHost === "0.0.0.0" || rawHost === "::" ? "127.0.0.1" : rawHost;
  const authority = host.includes(":") ? `[${host}]` : host;
  return `http://${authority}:${port}${PLATFORM_PROVISIONING_HTTP_PATH_PREFIX}${operation}`;
}
