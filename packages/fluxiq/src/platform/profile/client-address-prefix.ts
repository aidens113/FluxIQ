import { expandIpv6 } from "./expand-ipv6.ts";
import { normalizeIpAddress } from "./normalize-ip-address.ts";

/** The network an address belongs to: IPv4 "a.b.c.0/24", IPv6 its first 48 bits "x:y:z::/48", else null. */
export function clientAddressPrefix(address: string | null): string | null {
  const normalized = normalizeIpAddress(address);
  if (!normalized) return null;
  if (!normalized.includes(":")) return `${normalized.split(".").slice(0, 3).join(".")}.0/24`;
  const groups = expandIpv6(normalized);
  if (!groups) return null;
  return `${groups.slice(0, 3).map((group) => group.toString(16)).join(":")}::/48`;
}
