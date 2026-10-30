import { expandIpv6 } from "./expand-ipv6.ts";

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u;

function isIpv4(text: string): boolean {
  const match = IPV4.exec(text);
  return match !== null && match.slice(1).every((octet) => Number(octet) <= 255);
}

/**
 * Reduces a peer or forwarded value to a bare IP address: strips brackets,
 * a port and the `::ffff:` IPv4-mapped prefix. Returns null when the value is
 * not shaped like an IPv4 or IPv6 address (a pure check, no `node:net`).
 */
export function normalizeIpAddress(value: string | null | undefined): string | null {
  let text = (value ?? "").trim();
  if (text === "") return null;
  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/u.exec(text);
  if (bracketed) text = bracketed[1] as string;
  else if (/^[^:]+:\d{1,5}$/u.test(text)) text = text.slice(0, text.lastIndexOf(":"));
  const zone = text.indexOf("%");
  if (zone > 0 && text.includes(":")) text = text.slice(0, zone);
  if (isIpv4(text)) return text;
  const groups = expandIpv6(text);
  if (!groups) return null;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const high = groups[6] as number;
    const low = groups[7] as number;
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return text.toLowerCase();
}
