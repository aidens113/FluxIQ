import { iamActionName } from "@fluxiq/contracts/iam";
import { iamEndpointAccessLevel, iamProgramService, type IamEndpointRegistration } from "../catalog/index.ts";

/**
 * The actions of `endpoints` (a live registry's `endpoints()`) that read and
 * change nothing: those whose catalog access level is `Read` or `List`, as
 * `iamEndpointAccessLevel` decides it for the action catalog. What the
 * decision audit drops when allowed (`IamDecisionAuditFilter`); every other
 * action is kept, and so is one whose level cannot be told (a classification
 * with no default level), so a gap records more, never less. An action
 * several programs register is a read only when every registration is.
 * Sorted, each once.
 */
export function iamReadActionsOf(endpoints: readonly IamEndpointRegistration[]): string[] {
  const reads = new Set<string>();
  const writes = new Set<string>();
  for (const endpoint of endpoints) {
    const action = iamActionName(iamProgramService(endpoint.programId), endpoint.endpoint);
    if (readLevel(action, endpoint)) reads.add(action);
    else writes.add(action);
  }
  return [...reads].filter((action) => !writes.has(action)).sort();
}

function readLevel(action: string, endpoint: IamEndpointRegistration): boolean {
  try {
    const level = iamEndpointAccessLevel(action, endpoint.endpoint, endpoint.classification);
    return level === "Read" || level === "List";
  } catch {
    return false;
  }
}
