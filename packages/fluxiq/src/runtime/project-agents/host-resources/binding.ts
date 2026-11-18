import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioHostResourceLease } from "../../automation-host/index.ts";
import type { AutomationStudioHostLeaseAuthority } from "./authority.ts";

/** Internal capability, created only by the instance authority; never part of a wire lease. */
export type AutomationStudioHostLeaseBinding = Readonly<{
  owner: AutomationStudioHostLeaseAuthority;
  domainId: string | null;
  current(): AutomationStudioHostResourceLease | undefined;
  isCurrent(lease: ClientGatewayHostLease): boolean;
  /** With no destination session, whether any strict resource in this binding is held. */
  requiresLease(sessionId?: string): boolean;
}>;
