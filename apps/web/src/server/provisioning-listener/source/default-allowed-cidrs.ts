/**
 * The sources the listener allows when `FLUXIQ_PROVISIONING_ALLOWED_CIDRS` is
 * unset, and the only ranges any configured entry may fall inside: loopback,
 * the RFC 1918 private ranges, IPv6 unique-local and loopback, and the
 * IPv4-mapped forms of the IPv4 ones (a dual-stack socket reports an IPv4
 * peer as `::ffff:a.b.c.d`).
 */
export const DEFAULT_ALLOWED_CIDRS: readonly string[] = Object.freeze([
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "::1/128",
  "fc00::/7",
  "::ffff:127.0.0.0/104",
  "::ffff:10.0.0.0/104",
  "::ffff:172.16.0.0/108",
  "::ffff:192.168.0.0/112"
]);
