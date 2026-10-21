import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/index.ts";
import type { AutomationStudioCandidateTrialPorts } from "../candidate-trial/index.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../project-build/index.ts";
// From its owner, not the project-build barrel, whose whole trials import this module back (a module cycle).
import { automationStudioProjectBuildTrialReads } from "../project-build/trial-reads.ts";

/** What the whole candidate's trial ports are made of: a build's trial environment, its bound domain, and the judge. */
export type AutomationStudioWholeTrialPortsInput = {
  environment: AutomationStudioProjectBuildTrialEnvironment;
  binding: AutomationStudioLlmEvidenceRuntimeBinding;
  judge: AutomationStudioCandidateTrialPorts["judge"];
};

/**
 * The whole candidate's trial ports (t340; trace plan P5): every member of the
 * build's trial environment, what its trials read from the bound domain beside
 * the run (`../project-build/trial-reads.ts`), and the judge. A build's whole
 * trials are made from these (`../project-build/whole-trials.ts`), and so are
 * the ports the trial-ports seam hands a host (`./service-ports.ts`).
 */
export function automationStudioWholeTrialPorts(input: AutomationStudioWholeTrialPortsInput): AutomationStudioCandidateTrialPorts {
  const { environment, binding } = input;
  return { ...environment, ...automationStudioProjectBuildTrialReads(binding, environment.projectId, environment.flowId), judge: input.judge };
}
