// The engine's parts for a real service, read through the same seam a build's trials read
// (`../../trial-ports/`), so `service.ts` gains nothing and a Flow run cannot drift from a trial.

import { AutomationStudioServiceTrialCollaboratorRegistry, automationStudioServiceTrialEnvironment } from "../../trial-ports/index.ts";
import type { AutomationStudioAnswerFirstAttemptInput } from "../attempt/index.ts";
import type { AutomationStudioAnswerFirstFlowRunEngine } from "./ports.ts";

/** What a service gives a Flow run of `input`'s Flow. Throws for an owner that is no service, which the run reads as a run that could not start. */
export function automationStudioAnswerFirstFlowRunEngineOf(input: Pick<AutomationStudioAnswerFirstAttemptInput, "owner" | "projectId" | "flowId" | "instructionIds" | "startLocation" | "registry" | "resolution">): AutomationStudioAnswerFirstFlowRunEngine {
  const collaborators = AutomationStudioServiceTrialCollaboratorRegistry.of(input.owner);
  if (!collaborators) throw new Error("automation_studio.trial_ports_unavailable: the service adopted no trial collaborators");
  const environment = automationStudioServiceTrialEnvironment(collaborators, {
    projectId: input.projectId, flowId: input.flowId, sourceInstructionIds: input.instructionIds, startLocation: input.startLocation, registry: input.registry, resolution: input.resolution
  });
  const native = collaborators.executor().nativeNodeRuntime;
  return {
    parentFlow: environment.parentFlow,
    currentBaseDigest: environment.currentBaseDigest,
    snapshots: environment.snapshots,
    deprecatedPublicationIds: environment.deprecatedPublicationIds,
    graphOptions: environment.graphOptions,
    domainReadings: environment.domainReadings,
    ...(native ? { definitions: () => native.listDefinitions() } : {})
  };
}
