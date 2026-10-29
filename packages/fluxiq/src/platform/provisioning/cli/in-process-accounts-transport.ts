import { PLATFORM_PROVISIONING_OPERATIONS, type PlatformProvisioningOperationName } from "@fluxiq/contracts/platform";
import type { PlatformProvisioning } from "../types.ts";
import { AccountsTransportError } from "./transport-error.ts";
import type { AccountsCommandTransport } from "./types.ts";

/** Calls the provisioning service in this process, as the operator (`platform-admin`). */
export function inProcessAccountsTransport(provisioning: PlatformProvisioning): AccountsCommandTransport {
  return {
    async run(operation, input) {
      if (!Object.hasOwn(PLATFORM_PROVISIONING_OPERATIONS, operation)) throw new AccountsTransportError(`unknown operation "${operation}"`);
      return provisioning.run(operation as PlatformProvisioningOperationName, input, { kind: "platform-admin", transport: "in-process" });
    }
  };
}
