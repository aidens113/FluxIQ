import { BlockList, isIPv4 } from "node:net";
import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";
import { isPrivateCidr } from "./is-private-cidr";
import { parseCidr } from "./parse-cidr";

/**
 * The sources allowed to call the private listener. Built only from CIDRs
 * that are loopback or private: an entry such as `0.0.0.0/0` or a public
 * range would put the listener on the internet, so it refuses to start.
 */
export class SourceAllowlist {
  private constructor(private readonly list: BlockList) {}

  static fromCidrs(entries: readonly string[]): SourceAllowlist {
    if (entries.length === 0) throw new ProvisioningListenerConfigError("FLUXIQ_PROVISIONING_ALLOWED_CIDRS names no source.");
    const list = new BlockList();
    for (const entry of entries) {
      const cidr = parseCidr(entry);
      if (!isPrivateCidr(cidr)) {
        throw new ProvisioningListenerConfigError(`FLUXIQ_PROVISIONING_ALLOWED_CIDRS holds "${entry.trim()}", which is not inside a loopback or private range; the provisioning listener is never reachable from a public address.`);
      }
      list.addSubnet(cidr.address, cidr.prefix, cidr.family);
    }
    return new SourceAllowlist(list);
  }

  /** Whether a normalized peer address (see `normalizePeerAddress`) may call. */
  allows(address: string): boolean {
    return this.list.check(address, isIPv4(address) ? "ipv4" : "ipv6");
  }
}
