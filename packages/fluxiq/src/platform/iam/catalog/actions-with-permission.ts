import { iamActionName } from "@fluxiq/contracts/iam";
import type { IamEndpointRegistration } from "./endpoint-registration.ts";
import { iamProgramService } from "./program-service.ts";

/** Sorted unique action names of the endpoints that require `permission`. */
export function iamActionsWithPermission(endpoints: readonly IamEndpointRegistration[], permission: string): string[] {
  const actions = endpoints.filter((item) => item.permission === permission).map((item) => iamActionName(iamProgramService(item.programId), item.endpoint));
  return [...new Set(actions)].sort();
}
