import { isIPv4, isIPv6 } from "node:net";
import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";
import type { ParsedCidr } from "./types";

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/iu;
const PREFIX = /^\d{1,3}$/u;

/**
 * Parses `address/prefix` or a bare address (a single host). An IPv4-mapped
 * IPv6 entry with a prefix of at least 96 becomes its IPv4 form, so it and the
 * plain IPv4 entry mean the same sources. Throws for anything else.
 */
export function parseCidr(entry: string): ParsedCidr {
  const trimmed = entry.trim();
  const slash = trimmed.indexOf("/");
  const address = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const prefixText = slash === -1 ? null : trimmed.slice(slash + 1);
  const family = isIPv4(address) ? "ipv4" : isIPv6(address) ? "ipv6" : null;
  if (family === null) throw invalid(trimmed);
  const maxPrefix = family === "ipv4" ? 32 : 128;
  if (prefixText !== null && !PREFIX.test(prefixText)) throw invalid(trimmed);
  const prefix = prefixText === null ? maxPrefix : Number(prefixText);
  if (prefix > maxPrefix) throw invalid(trimmed);
  const mapped = family === "ipv6" ? IPV4_MAPPED.exec(address) : null;
  if (mapped !== null && mapped[1] !== undefined && isIPv4(mapped[1]) && prefix >= 96) {
    return { family: "ipv4", address: mapped[1], prefix: prefix - 96 };
  }
  return { family, address, prefix };
}

function invalid(entry: string): ProvisioningListenerConfigError {
  return new ProvisioningListenerConfigError(`FLUXIQ_PROVISIONING_ALLOWED_CIDRS holds "${entry}", which is not a CIDR (address/prefix) or an address.`);
}
