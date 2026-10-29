// Barrel for account provisioning (hosted production plan, Account
// Provisioning API; lane B1): the ports and surface (`types.ts`), the
// service and its composition, the email senders, and the operator command
// line. Operations, links, policies and idempotency are internal: reach them
// through `createPlatformProvisioning`.
export * from "./cli/index.ts";
export type * from "./context/index.ts";
export * from "./email/index.ts";
export * from "./service/index.ts";
export type * from "./types.ts";
// The contract values the private listener and the command line answer by,
// re-exported so `apps/web` (which depends on `fluxiq` alone) reaches them.
export { PLATFORM_PROVISIONING_ERROR_STATUS, PLATFORM_PROVISIONING_OPERATIONS, platformProvisioningResponseSchema, provisioningOperationForHttpPath } from "@fluxiq/contracts/platform";
export type { PlatformProvisioningErrorCode, PlatformProvisioningOperationName } from "@fluxiq/contracts/platform";
