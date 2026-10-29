import { isIP } from "node:net";
import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";

const BRACKETED = /^\[([^\]]+)\]:(\d{1,5})$/u;
const PLAIN = /^([^:[\]]+):(\d{1,5})$/u;

/**
 * Parses `FLUXIQ_PROVISIONING_LISTEN`: `host:port` with an IP literal or
 * `localhost` (an IPv6 literal in brackets, `[::1]:4780`) and a port from 1 to
 * 65535. Throws for anything else.
 */
export function parseListenAddress(value: string): { host: string; port: number } {
  const trimmed = value.trim();
  const match = BRACKETED.exec(trimmed) ?? PLAIN.exec(trimmed);
  const host = match?.[1];
  const portText = match?.[2];
  if (host === undefined || portText === undefined) throw invalid(trimmed);
  const port = Number(portText);
  const hostOk = host === "localhost" || isIP(host) !== 0;
  if (!hostOk || port < 1 || port > 65_535) throw invalid(trimmed);
  return { host, port };
}

function invalid(value: string): ProvisioningListenerConfigError {
  return new ProvisioningListenerConfigError(`FLUXIQ_PROVISIONING_LISTEN is "${value}"; it must be host:port with an IP address or localhost and a port from 1 to 65535 (for example 127.0.0.1:4780).`);
}
