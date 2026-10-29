import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";
import type { ProvisioningListenerReservedPort } from "../types";

/**
 * Refuses a listen port that is not a port number, or that the panel or the
 * client gateway owns: the reverse proxy routes those ports to the internet,
 * and the provisioning listener must never sit behind it.
 */
export function assertPrivateBind(port: number, reservedPorts: readonly ProvisioningListenerReservedPort[]): void {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new ProvisioningListenerConfigError(`The provisioning listener port ${String(port)} is not a port number.`);
  }
  const taken = reservedPorts.find((reserved) => reserved.port === port);
  if (taken !== undefined) {
    throw new ProvisioningListenerConfigError(`The provisioning listener may not use port ${port}: it is the port of ${taken.owner}, which is reachable from outside. Give FLUXIQ_PROVISIONING_LISTEN a port of its own.`);
  }
}
