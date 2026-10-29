import { BlockList } from "node:net";
import { DEFAULT_ALLOWED_CIDRS } from "./default-allowed-cidrs";
import { parseCidr } from "./parse-cidr";
import type { ParsedCidr } from "./types";

type PrivateRange = { cidr: ParsedCidr; list: BlockList };

const PRIVATE_RANGES: readonly PrivateRange[] = DEFAULT_ALLOWED_CIDRS.map((entry) => {
  const cidr = parseCidr(entry);
  const list = new BlockList();
  list.addSubnet(cidr.address, cidr.prefix, cidr.family);
  return { cidr, list };
});

/**
 * Whether every address of `cidr` is loopback or private: some private range
 * of its family is at least as wide as it and holds its address. (All of the
 * CIDR's addresses share their first `prefix` bits with that address, so the
 * one test covers them all.)
 */
export function isPrivateCidr(cidr: ParsedCidr): boolean {
  return PRIVATE_RANGES.some((range) => range.cidr.family === cidr.family && cidr.prefix >= range.cidr.prefix && range.list.check(cidr.address, cidr.family));
}
