// The frozen provisioning contract values the private listener answers by:
// the path-to-operation rule and the status of each typed error, reached
// through `fluxiq/platform`, which re-exports them from the contract.
export { PLATFORM_PROVISIONING_ERROR_STATUS, provisioningOperationForHttpPath } from "fluxiq/platform";
export type { PlatformProvisioningErrorCode, PlatformProvisioningOperationName } from "fluxiq/platform";
