import type { ClientGatewayActivityResolution } from "@fluxiq/contracts/client-gateway";
import { invokeRuntimeActivityPresentation } from "./invoke.ts";

export function automationStudioActivityAskResolution(...args: unknown[]): ClientGatewayActivityResolution {
  const value = invokeRuntimeActivityPresentation("automationStudioActivityAskResolution", args);
  return value === "allowed" || value === "declined" || value === "timed_out" || value === "waited_out" ? value : "answered";
}
