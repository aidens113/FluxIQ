import { isIP } from "node:net";

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu;

/**
 * The caller's address as the decision audit keeps it: an IPv4 address
 * truncated to its /24 (`203.0.113.0/24`), an IPv6 address to its /48
 * (`2001:db8:1::/48`), or null for an absent or unparseable address. An
 * IPv4-mapped IPv6 address (`::ffff:203.0.113.7`, as Node reports IPv4 peers)
 * is treated as IPv4.
 */
export function iamIpPrefix(sourceIp: string | undefined): string | null {
  if (sourceIp === undefined) return null;
  const mapped = MAPPED_IPV4.exec(sourceIp);
  const address = mapped?.[1] ?? sourceIp;
  const family = isIP(address);
  if (family === 4) return ipv4Prefix(address);
  if (family === 6) return ipv6Prefix(address);
  return null;
}

function ipv4Prefix(address: string): string {
  const octets = address.split(".");
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function ipv6Prefix(address: string): string {
  const groups = expandIpv6(address).slice(0, 3).map((group) => group.replace(/^0+(?=.)/u, "").toLowerCase());
  return `${groups.join(":")}::/48`;
}

function expandIpv6(address: string): string[] {
  const [head = "", tail] = address.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const missing = 8 - left.length - right.length;
  return [...left, ...Array.from({ length: Math.max(missing, 0) }, () => "0"), ...right];
}
