import type { PlatformAccountOrigin } from "../../store/index.ts";
import type { PlatformProvisioningCaller } from "../types.ts";

/** How an account came to exist, from who created it: the private listener, the command line, or an in-process caller. */
export function accountOrigin(caller: PlatformProvisioningCaller): PlatformAccountOrigin {
  if (caller.kind === "platform-admin") return "command-line";
  if (caller.kind === "service-identity" && caller.transport === "http") return "provisioning-listener";
  return "in-process";
}
