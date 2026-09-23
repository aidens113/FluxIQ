// Everything a finished build's permission gate has to say, read off it once.
//
// Four separate facts used to be lifted out of the gate by hand at two call
// sites in `runtime/service.ts`, which is how one of them came to be read at
// one site and not the other. They are one thing: what this build declared,
// what its instruction was read as asking for, Core's reading of the two
// together, and the request a refusal raised. A caller takes them in one call
// and hands them to `createFlowBootstrapAdaptation` as they are.
//
// The order matters and is the reason this is a function rather than four
// getters. `crossCheck()` may derive the instruction's authority for a build
// that never needed it, so `instructed()` is read *after* it: reading it first
// gives the set as it stood before the derivation, which for the build this
// exists to catch -- every action declaring nothing lasting -- is empty.

import type {
  AutomationStudioActionDeclarationCrossCheck,
  AutomationStudioActionDeclarationRecord,
  AutomationStudioActionPermissionRequest,
  AutomationStudioInstructedConsequence
} from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapActionPermissions } from "../../flow-bootstrap/index.ts";

/** What the gate says, in the shape a proposal stores it. Absent fields are facts the build has none of. */
export type AutomationStudioBootstrapPermissionOutcome = {
  instructedConsequences?: AutomationStudioInstructedConsequence[];
  declaredConsequences?: AutomationStudioActionDeclarationRecord[];
  consequenceCrossCheck?: AutomationStudioActionDeclarationCrossCheck;
  permissionRequest?: AutomationStudioActionPermissionRequest;
  /** Provider calls the build made outside the evidence loop, so its recorded call count is the whole of what it spent. */
  additionalProviderCalls?: number;
};

export async function automationStudioBootstrapPermissionOutcome(
  permissions: AutomationStudioFlowBootstrapActionPermissions,
  additionalProviderCalls: () => number
): Promise<AutomationStudioBootstrapPermissionOutcome> {
  const request = permissions.request();
  const declarations = permissions.declarations();
  const crossCheck = await permissions.crossCheck();
  const instructed = permissions.instructed();
  const calls = additionalProviderCalls();
  return {
    ...(instructed?.length ? { instructedConsequences: [...instructed] } : {}),
    ...(declarations.length ? { declaredConsequences: [...declarations] } : {}),
    ...(crossCheck ? { consequenceCrossCheck: crossCheck } : {}),
    ...(request ? { permissionRequest: request } : {}),
    ...(calls > 0 ? { additionalProviderCalls: calls } : {})
  };
}
