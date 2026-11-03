import type { AutomationStudioService } from "../../service.ts";
import type { AutomationStudioCandidateTrialPorts } from "../candidate-trial/index.ts";
import { AutomationStudioServiceTrialCollaboratorRegistry } from "./collaborator-registry.ts";
import { automationStudioServiceTrialEnvironment } from "./environment.ts";
import { automationStudioServiceRegistryResolution } from "./registry-resolution.ts";
import { automationStudioWholeTrialPorts } from "./whole-ports.ts";

// The whole candidate's trial ports a host makes from an Automation Studio
// service outside a build (traces and offline trials, P5): what an offline
// trial of a recorded build runs with, and what a build will hand its own
// offline trials (P6). The build's own composition, piece for piece: the
// registry and resolution for the parent Flow's scope
// (`./registry-resolution.ts`), the trial environment from the service's
// collaborators (`./environment.ts`), then the whole ports with the bound
// domain's trial reads (`./whole-ports.ts`). Two members differ from a live
// build's, by design:
//
// - `judge` is the caller's: an offline trial may judge with no model at all;
// - no start hook: an offline trial runs none and resets no site (Decision 6).
//
// `observedStateKeys` is the bound domain's declaration, each key once: what a
// build's harness options carry when any tool of the domain is offered
// (`llm/harness-options/registry.ts`). A service with no bound domain has no
// trial reads and no Flow a trial could run, so it is refused, as a build is.

/** What the trial ports are made for: the build's Flow, its instructions and start, and the judge every trial asks. */
export type AutomationStudioServiceWholeTrialPortsInput = {
  projectId: string;
  flowId: string;
  sourceInstructionIds: readonly string[];
  startLocation?: string | undefined;
  judge: AutomationStudioCandidateTrialPorts["judge"];
};

/**
 * The whole-candidate trial ports `service` makes for `input`'s Flow, as a
 * build's trial environment and whole trials make them, with the caller's
 * judge and no start hook (header). Rejects for a service that adopted no
 * collaborators or has no evidence runtime bound.
 */
export async function automationStudioServiceWholeTrialPorts(service: AutomationStudioService, input: AutomationStudioServiceWholeTrialPortsInput): Promise<AutomationStudioCandidateTrialPorts> {
  const collaborators = AutomationStudioServiceTrialCollaboratorRegistry.of(service);
  if (!collaborators) throw new Error("automation_studio.trial_ports_unavailable: the service adopted no trial collaborators");
  const binding = collaborators.binding();
  if (!binding) throw new Error("automation_studio.trial_ports_unavailable: no evidence runtime is bound to the service");
  const { projectId, flowId } = input;
  const parent = await collaborators.getFlow(projectId, flowId);
  const { registry, resolution } = automationStudioServiceRegistryResolution(collaborators.executor().nativeNodeRuntime, parent.scope);
  const observed = [...new Set(binding.observedStateKeys ?? [])];
  const environment = automationStudioServiceTrialEnvironment(collaborators, {
    projectId, flowId, sourceInstructionIds: [...input.sourceInstructionIds], startLocation: input.startLocation, registry, resolution,
    ...(observed.length ? { observedStateKeys: observed } : {})
  });
  return automationStudioWholeTrialPorts({ environment, binding, judge: input.judge });
}
