// What applying a proven Flow needs of the service, and nothing else of it. The generation path
// hands the attempt the service as `owner` (`../attempt/contracts.ts`), and the service answers this
// with the public methods it already has, so `service.ts` gains nothing and the compiler holds the
// two together. Tests reach the same methods on the same object, so a test can fail one of them.

import type { AutomationStudioFlowArtifact } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioActionDeclarationRecord, AutomationStudioInstructedConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioBootstrapAdaptation, AutomationStudioBootstrapAdaptationMode, AutomationStudioBootstrapAdaptationOrigin, AutomationStudioBootstrapExistingTopology, AutomationStudioFlowBuildPlan } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";

export type AutomationStudioAnswerFirstFlowWriter = {
  getLlmExecutionDependencyDigest(projectId: string, flowId: string): Promise<string>;
  getFlow(projectId: string, flowId: string): Promise<Pick<AutomationStudioFlowArtifact, "nodes" | "edges">>;
  /** A person's first look at a Flow's graph indexes it (`./apply-proven.ts`). */
  getFlowGraphViewport(input: { projectId: string; flowId: string; bounds: { minX: number; minY: number; maxX: number; maxY: number }; limit: number }): Promise<unknown>;
  getFlowRouter(projectId: string, flowId: string): Promise<{ routerId: string } | null>;
  listFlowSubflowSummaries(input: { projectId: string; flowId: string; limit: number; offset: number }): Promise<{ total: number; subflows: readonly { subflowId: string; graphFlowId?: string; role?: string; status?: string }[] }>;
  createFlowBootstrapAdaptation(input: {
    projectId: string;
    flowId: string;
    baseDependencyDigest: string;
    sourceInstructionIds: string[];
    summary: string;
    buildPlan: AutomationStudioFlowBuildPlan;
    mode?: AutomationStudioBootstrapAdaptationMode;
    origin?: AutomationStudioBootstrapAdaptationOrigin;
    existingIds?: AutomationStudioBootstrapExistingTopology;
    instructedConsequences?: AutomationStudioInstructedConsequence[];
    declaredConsequences?: AutomationStudioActionDeclarationRecord[];
    actorId?: string;
  }): Promise<Pick<AutomationStudioBootstrapAdaptation, "adaptationId">>;
  reviewFlowBootstrapAdaptation(input: { projectId: string; flowId: string; adaptationId: string; action: "approve" | "reject" | "apply"; actorId: string }): Promise<Pick<AutomationStudioBootstrapAdaptation, "application">>;
};
