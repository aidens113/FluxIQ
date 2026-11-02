import { describe, expect, it } from "vitest";
import { AutomationStudioCanonicalExecution as legacyExecution } from "../owner.ts";
import { AutomationStudioCanonicalExecution } from "../../../../../engine/automation/composite/index.ts";
import { compileAutomationStudioPlan as legacyCompile, assertAutomationStudioCompiledPlan as legacyAssert, compiledPlanToFlowDocument } from "../../compiled-plan.ts";
import { compileAutomationStudioPlan, assertAutomationStudioCompiledPlan } from "../../../../../flows/executable/compiled-plan/index.ts";
import * as model from "../../../model/index.ts";
import * as executable from "../../../../../flows/executable/composite/index.ts";
import { projectPublishedFlowSnapshotToNodeDefinition } from "../../../../../components/automation/composite/index.ts";

describe("Studio compiled/composite compatibility", () => {
  it("keeps the class and pure helpers as exact canonical identities", () => {
    expect(legacyExecution).toBe(AutomationStudioCanonicalExecution);
    expect(legacyCompile).toBe(compileAutomationStudioPlan);
    expect(legacyAssert).toBe(assertAutomationStudioCompiledPlan);
    expect(model.createCallFlowNode).toBe(executable.createCallFlowNode);
    expect(model.getCallFlowConfiguration).toBe(executable.getCallFlowConfiguration);
    expect(model.compositeNodeDefinitionId).toBe(executable.compositeNodeDefinitionId);
    expect(model.validateFlowComposition).toBe(executable.validateFlowComposition);
    expect(model.projectPublishedFlowSnapshotToNodeDefinition).toBe(projectPublishedFlowSnapshotToNodeDefinition);
  });

  it("retains the explicit legacy document projection outside the executable compiler", () => {
    const plan = legacyCompile({ projectId: "project.legacy", flowId: "flow.legacy", flowRevision: 1, graphRevision: 1, settingsRevision: 1, compiledAt: 42, nodes: [], edges: [] });
    expect(compiledPlanToFlowDocument(plan)).toMatchObject({
      schemaVersion: "0.1", ownerKind: "policy", ownerId: "project.legacy", name: "flow.legacy",
      createdAt: 42, updatedAt: 42, nodes: [], edges: [],
      metadata: { compiledArtifact: true, planDigest: plan.planDigest }
    });
  });
});
