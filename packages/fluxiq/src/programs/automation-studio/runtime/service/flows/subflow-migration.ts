import {
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowSubflow,
  withAutomationStudioFlowRepresentation
} from "../../../model/index.ts";
import { uniqueEvidenceReferences } from "../../policy-model.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioFlowWriter } from "./writer.ts";

function sameAutomationStudioFlowGraph(left: AutomationStudioFlowArtifact, right: AutomationStudioFlowArtifact): boolean {
  return JSON.stringify(left.nodes) === JSON.stringify(right.nodes)
    && JSON.stringify(left.edges) === JSON.stringify(right.edges);
}

// Getting a proposal onto an executable graph. A proposal destination must be
// a top-level orchestration Flow, so this finds or creates its primary Subflow
// and, for a Flow still holding its graph directly, moves that graph into the
// Subflow it now owns. Every step verifies the Router fallback it just wrote,
// so an interrupted migration cannot be mistaken for a finished one.
export class AutomationStudioFlowSubflowMigration {
  constructor(
    private readonly flowWriter: AutomationStudioFlowWriter,
    private readonly facade: AutomationStudioFacadePorts
  ) {}

  async ensureProposalPrimarySubflow(parentFlow: AutomationStudioFlowArtifact): Promise<{
    parentFlow: AutomationStudioFlowArtifact;
    subflow: AutomationStudioFlowSubflow;
    graphFlow: AutomationStudioFlowArtifact;
  }> {
    if (this.flowWriter.persistedFlowRepresentation(parentFlow) === "subflow_graph") {
      throw new Error("Proposal Flow destinations must be top-level orchestration Flows, not Subflow graph Flows.");
    }
    if (this.flowWriter.persistedFlowRepresentation(parentFlow) === "legacy_single_graph" && parentFlow.source.mode === "code") {
      throw new Error("Code-owned legacy Flows require an explicit source migration before Subflow/Router conversion.");
    }
    const primaryPage = await this.facade.listFlowSubflowSummaries({
      projectId: parentFlow.projectId,
      flowId: parentFlow.flowId,
      role: "primary",
      sort: "updated",
      direction: "asc",
      limit: 1,
      offset: 0
    });
    const configuredRouter = await this.facade.getFlowRouter(parentFlow.projectId, parentFlow.flowId);
    const fallbackSubflow = configuredRouter?.fallback?.kind === "subflow"
      ? await this.facade.getFlowSubflow(parentFlow.projectId, parentFlow.flowId, configuredRouter.fallback.subflowId)
      : null;
    const subflow = fallbackSubflow ?? (primaryPage.subflows[0]
      ? await this.facade.getFlowSubflow(parentFlow.projectId, parentFlow.flowId, primaryPage.subflows[0].subflowId)
      : await this.facade.createFlowSubflow({
        projectId: parentFlow.projectId,
        flowId: parentFlow.flowId,
        name: "Primary",
        description: `Primary executable graph for ${parentFlow.name}.`,
        role: "primary"
      }));
    if (!subflow?.graphFlowId) throw new Error("Primary Subflow does not own an executable graph Flow.");
    const graphFlow = await this.facade.getFlow(parentFlow.projectId, subflow.graphFlowId);
    if (this.flowWriter.persistedFlowRepresentation(parentFlow) === "orchestration") {
      await this.facade.setFlowMapFallback({
        projectId: parentFlow.projectId,
        flowId: parentFlow.flowId,
        kind: "subflow",
        targetSubflowId: subflow.subflowId
      });
      const router = await this.facade.getFlowRouter(parentFlow.projectId, parentFlow.flowId);
      if (router?.fallback?.kind !== "subflow" || router.fallback.subflowId !== subflow.subflowId) {
        throw new Error("Primary Subflow Router fallback verification failed.");
      }
      return { parentFlow, subflow, graphFlow };
    }
    return await this.migrateLegacyParentIntoOwnedSubflow(parentFlow, subflow, graphFlow);
  }

  async migrateLegacyParentIntoOwnedSubflow(
    parentFlow: AutomationStudioFlowArtifact,
    subflow: AutomationStudioFlowSubflow,
    initialGraphFlow: AutomationStudioFlowArtifact
  ): Promise<{
    parentFlow: AutomationStudioFlowArtifact;
    subflow: AutomationStudioFlowSubflow;
    graphFlow: AutomationStudioFlowArtifact;
  }> {
    if (this.flowWriter.persistedFlowRepresentation(parentFlow) !== "legacy_single_graph") {
      throw new Error("Only a legacy single-graph parent Flow can be migrated into a Subflow graph.");
    }
    if (!subflow.graphFlowId || subflow.projectId !== parentFlow.projectId || subflow.flowId !== parentFlow.flowId
      || initialGraphFlow.flowId !== subflow.graphFlowId) {
      throw new Error("The migration target does not prove exact parent Flow and Subflow ownership.");
    }
    await this.flowWriter.assertOwnedSubflowGraph(parentFlow.projectId, initialGraphFlow);
    let graphFlow = initialGraphFlow;
    if (parentFlow.nodes.length === 0 && parentFlow.edges.length === 0) {
      await this.facade.setFlowMapFallback({
        projectId: parentFlow.projectId,
        flowId: parentFlow.flowId,
        kind: "subflow",
        targetSubflowId: subflow.subflowId
      });
      const router = await this.facade.getFlowRouter(parentFlow.projectId, parentFlow.flowId);
      if (router?.fallback?.kind !== "subflow" || router.fallback.subflowId !== subflow.subflowId) {
        throw new Error("Subflow Router fallback verification failed; interrupted legacy migration was not finalized.");
      }
      const savedParent = await this.flowWriter.saveFlowInternal({
        projectId: parentFlow.projectId,
        flow: {
          ...parentFlow,
          metadata: withAutomationStudioFlowRepresentation(parentFlow.metadata, "orchestration")
        }
      }, false, "orchestration");
      return { parentFlow: savedParent, subflow, graphFlow };
    }
    const graphAlreadyMatchesParent = sameAutomationStudioFlowGraph(graphFlow, parentFlow);
    if ((graphFlow.nodes.length || graphFlow.edges.length) && !graphAlreadyMatchesParent) {
      throw new Error("Cannot migrate a legacy parent graph into a non-empty Subflow graph that does not match it exactly.");
    }
    const expectedEvidence = uniqueEvidenceReferences([...(graphFlow.evidenceReferences ?? []), ...(parentFlow.evidenceReferences ?? [])]);
    const executionDefaultsMatch = JSON.stringify(graphFlow.executionDefaults ?? null) === JSON.stringify(parentFlow.executionDefaults ?? null);
    const evidenceMatches = JSON.stringify(graphFlow.evidenceReferences ?? []) === JSON.stringify(expectedEvidence);
    if (!graphAlreadyMatchesParent || !executionDefaultsMatch || !evidenceMatches) {
      const { executionDefaults: _existingExecutionDefaults, ...graphWithoutExecutionDefaults } = graphFlow;
      graphFlow = await this.facade.saveFlow({
        projectId: parentFlow.projectId,
        flow: {
          ...graphWithoutExecutionDefaults,
          nodes: parentFlow.nodes,
          edges: parentFlow.edges,
          evidenceReferences: expectedEvidence,
          ...(parentFlow.executionDefaults ? { executionDefaults: structuredClone(parentFlow.executionDefaults) } : {})
        }
      });
    }
    graphFlow = await this.facade.getFlow(parentFlow.projectId, subflow.graphFlowId);
    if (!sameAutomationStudioFlowGraph(graphFlow, parentFlow)
      || JSON.stringify(graphFlow.executionDefaults ?? null) !== JSON.stringify(parentFlow.executionDefaults ?? null)) {
      throw new Error("Subflow graph and dependency verification failed; the legacy parent graph was not cleared.");
    }
    await this.facade.setFlowMapFallback({
      projectId: parentFlow.projectId,
      flowId: parentFlow.flowId,
      kind: "subflow",
      targetSubflowId: subflow.subflowId
    });
    const router = await this.facade.getFlowRouter(parentFlow.projectId, parentFlow.flowId);
    if (router?.fallback?.kind !== "subflow" || router.fallback.subflowId !== subflow.subflowId) {
      throw new Error("Subflow Router fallback verification failed; the parent graph was not cleared.");
    }
    const { executionDefaults: _migratedExecutionDefaults, ...parentWithoutGraphDependencies } = parentFlow;
    const savedParent = await this.flowWriter.saveFlowInternal({
      projectId: parentFlow.projectId,
      flow: {
        ...parentWithoutGraphDependencies,
        nodes: [],
        edges: [],
        metadata: withAutomationStudioFlowRepresentation(parentFlow.metadata, "orchestration")
      }
    }, false, "orchestration");
    return { parentFlow: savedParent, subflow, graphFlow };
  }
}
