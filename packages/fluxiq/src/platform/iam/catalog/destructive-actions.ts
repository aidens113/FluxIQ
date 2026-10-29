import { iamActionName } from "@fluxiq/contracts/iam";
import type { IamEndpointRegistration } from "./endpoint-registration.ts";
import { iamProgramService } from "./program-service.ts";

/** Sorted unique actions of endpoints classified `destructive` or `destructive-ungated`. */
export function iamDestructiveActions(endpoints: readonly IamEndpointRegistration[]): string[] {
  const picked = endpoints.filter((item) => item.classification === "destructive" || item.classification === "destructive-ungated");
  return [...new Set(picked.map((item) => iamActionName(iamProgramService(item.programId), item.endpoint)))].sort();
}
