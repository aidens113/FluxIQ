import path from "node:path";
import { safeSegment } from "../../../../_shared/storage.ts";
import { AutomationStudioProjectPaths } from "./project.ts";

// Every path under a single Flow's directory, resolved against the project
// layout rather than the storage root directly.
export class AutomationStudioFlowPaths {
  constructor(private readonly projectPaths: AutomationStudioProjectPaths) {}

  flowDirectory(projectId: string, flowId: string): string {
    return this.projectPaths.projectFile(projectId, "flows", safeSegment(flowId));
  }

  flowFile(projectId: string, flowId: string): string {
    return path.join(this.flowDirectory(projectId, flowId), "flow.json");
  }

  flowRouterFile(projectId: string, flowId: string): string {
    return path.join(this.flowDirectory(projectId, flowId), "router.json");
  }

  flowSubflowDirectory(projectId: string, flowId: string, subflowId: string): string {
    return path.join(this.flowDirectory(projectId, flowId), "subflows", safeSegment(subflowId));
  }

  flowSubflowFile(projectId: string, flowId: string, subflowId: string): string {
    return path.join(this.flowSubflowDirectory(projectId, flowId, subflowId), "subflow.json");
  }

  flowInstructionDirectory(projectId: string, flowId: string): string {
    return path.join(this.flowDirectory(projectId, flowId), "instructions");
  }

  flowInstructionFile(projectId: string, flowId: string, instructionId: string): string {
    return path.join(this.flowInstructionDirectory(projectId, flowId), `${safeSegment(instructionId)}.json`);
  }

  flowChangeProposalDirectory(projectId: string, flowId: string, proposalId: string): string {
    return path.join(this.flowDirectory(projectId, flowId), "change-proposals", safeSegment(proposalId));
  }

  flowChangeProposalFile(projectId: string, flowId: string, proposalId: string): string {
    return path.join(this.flowChangeProposalDirectory(projectId, flowId, proposalId), "proposal.json");
  }

  flowAdaptationsDirectory(projectId: string, flowId: string): string {
    return path.join(this.flowDirectory(projectId, flowId), "adaptations");
  }

  flowAdaptationDirectory(projectId: string, flowId: string, adaptationId: string): string {
    return path.join(this.flowAdaptationsDirectory(projectId, flowId), safeSegment(adaptationId));
  }

  flowAdaptationFile(projectId: string, flowId: string, adaptationId: string): string {
    return path.join(this.flowAdaptationDirectory(projectId, flowId, adaptationId), "adaptation.json");
  }

  flowBootstrapAdaptationFile(projectId: string, flowId: string, adaptationId: string): string {
    return path.join(this.flowAdaptationDirectory(projectId, flowId, adaptationId), "bootstrap.json");
  }

  flowAdaptationPolicyFile(projectId: string, flowId: string, policyId: string): string {
    return path.join(this.flowDirectory(projectId, flowId), "adaptation-policies", `${safeSegment(policyId)}.json`);
  }

  flowRunDirectory(projectId: string, runId: string): string {
    return this.projectPaths.projectFile(projectId, "runtime", "runs", safeSegment(runId));
  }

  flowRunDetailFile(projectId: string, runId: string): string {
    return path.join(this.flowRunDirectory(projectId, runId), "run.json");
  }

  flowRunActionsFile(projectId: string, runId: string): string {
    return path.join(this.flowRunDirectory(projectId, runId), "actions.jsonl");
  }

  flowRunRouteDecisionsFile(projectId: string, runId: string): string {
    return path.join(this.flowRunDirectory(projectId, runId), "route-decisions.jsonl");
  }

  flowRunSubflowsFile(projectId: string, runId: string): string {
    return path.join(this.flowRunDirectory(projectId, runId), "subflows.jsonl");
  }

  flowRunInterventionsFile(projectId: string, runId: string): string {
    return path.join(this.flowRunDirectory(projectId, runId), "interventions.jsonl");
  }
}
