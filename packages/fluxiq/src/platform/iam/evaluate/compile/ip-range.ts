type IpAddress = { version: 4 | 6; value: bigint };

const IPV4_OCTET = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/u;
const IPV6_GROUP = /^[0-9A-Fa-f]{1,4}$/u;
const PREFIX = /^\d{1,3}$/u;
const IPV4_MAPPED_HEAD = 0xffffn;

function parseIpv4(text: string): bigint | null {
  const octets = text.split(".");
  if (octets.length !== 4 || !octets.every((octet) => IPV4_OCTET.test(octet))) return null;
  return octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

// Hex groups of one side of `::`; the last side may end in a dotted quad,
// which stands for two groups.
function ipv6Groups(side: string, last: boolean): bigint[] | null {
  if (side === "") return [];
  const parts = side.split(":");
  const groups: bigint[] = [];
  for (const [index, part] of parts.entries()) {
    if (last && index === parts.length - 1 && part.includes(".")) {
      const quad = parseIpv4(part);
      if (quad === null) return null;
      groups.push(quad >> 16n, quad & 0xffffn);
      continue;
    }
    if (!IPV6_GROUP.test(part)) return null;
    groups.push(BigInt(`0x${part}`));
  }
  return groups;
}

function parseIpv6(text: string): bigint | null {
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const [head = "", tail] = halves;
  const left = ipv6Groups(head, tail === undefined);
  const right = tail === undefined ? [] : ipv6Groups(tail, true);
  if (left === null || right === null) return null;
  const count = left.length + right.length;
  if (tail === undefined ? count !== 8 : count > 7) return null;
  const groups = [...left, ...Array.from({ length: 8 - count }, () => 0n), ...right];
  return groups.reduce((value, group) => (value << 16n) | group, 0n);
}

function parseIpAddress(text: string): IpAddress | null {
  if (text.includes(":")) {
    const value = parseIpv6(text);
    return value === null ? null : { version: 6, value };
  }
  const value = parseIpv4(text);
  return value === null ? null : { version: 4, value };
}

// A request address `::ffff:a.b.c.d` (as Node reports an IPv4 peer on a dual
// stack socket) is the IPv4 address `a.b.c.d`.
function requestAddress(text: string): IpAddress | null {
  const address = parseIpAddress(text);
  if (address === null || address.version === 4 || address.value >> 32n !== IPV4_MAPPED_HEAD) return address;
  return { version: 4, value: address.value & 0xffffffffn };
}

/**
 * A predicate for one `IpAddress` / `NotIpAddress` value: an IPv4 or IPv6
 * address or CIDR block (`10.0.0.0/8`, `2001:db8::/32`; host bits past the
 * prefix are ignored). Null for a value that is neither. The predicate is
 * false for an address of the other family or one that does not parse; an
 * IPv4-mapped IPv6 request address is compared as IPv4.
 */
export function compileIamIpRange(range: string): ((address: string) => boolean) | null {
  const [text, prefixText, extra] = range.split("/");
  if (text === undefined || extra !== undefined) return null;
  const network = parseIpAddress(text);
  if (network === null) return null;
  const bits = network.version === 4 ? 32 : 128;
  if (prefixText !== undefined && !PREFIX.test(prefixText)) return null;
  const prefix = prefixText === undefined ? bits : Number(prefixText);
  if (prefix > bits) return null;
  const shift = BigInt(bits - prefix);
  const head = network.value >> shift;
  return (candidate) => {
    const address = requestAddress(candidate);
    return address !== null && address.version === network.version && address.value >> shift === head;
  };
}
