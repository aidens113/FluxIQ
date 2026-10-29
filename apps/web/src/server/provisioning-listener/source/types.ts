/** One parsed CIDR. An IPv4-mapped IPv6 CIDR (`::ffff:a.b.c.d/p`, p >= 96) is held as its IPv4 form. */
export type ParsedCidr = {
  family: "ipv4" | "ipv6";
  address: string;
  prefix: number;
};
