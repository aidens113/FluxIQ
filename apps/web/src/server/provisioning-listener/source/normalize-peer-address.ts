import { isIP, isIPv4 } from "node:net";

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu;

/**
 * The socket peer's address as the allowlist and the audit see it: an
 * IPv4-mapped IPv6 address becomes its IPv4 form. Null when the socket has
 * no address (it closed) or reports something that is not an IP.
 */
export function normalizePeerAddress(remoteAddress: string | undefined): string | null {
  if (remoteAddress === undefined || isIP(remoteAddress) === 0) return null;
  const mapped = IPV4_MAPPED.exec(remoteAddress);
  if (mapped !== null && mapped[1] !== undefined && isIPv4(mapped[1])) return mapped[1];
  return remoteAddress;
}
