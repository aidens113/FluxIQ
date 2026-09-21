import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../model/index.ts";
import {
  bootstrapAdaptationAsFlowAdaptation,
  normalizeAutomationStudioFlowBuildPlan,
  sanitizedBootstrapAccounting,
  type AutomationStudioBootstrapAdaptation,
  type AutomationStudioFlowBuildPlan
} from "../index.ts";

// The review projection is what every review surface reads for a Flow
// Bootstrap adaptation. These cases pin the shape it had when it moved out of
// runtime/service.ts, so a later change to it is a decision rather than drift.

const ADAPTATION_ID = "adaptation.bootstrap.7e2b0c41-5d8a-4f3e-a1b9-2c6d4e8f0a13";
const CREATED_AT = 1_700_000_000_000;

function buildPlan(): AutomationStudioFlowBuildPlan {
  const primary = {
    key: "primary",
    name: "Primary",
    role: "primary" as const,
    nodes: [
      { key: "open", definitionId: "domain.demo.open", definitionVersion: "1.0.0", parameters: { url: "https://example.test/queue" }, outputActionId: "demo.open", position: { x: 0, y: 0 } },
      { key: "extract", definitionId: "domain.demo.extract", definitionVersion: "1.0.0", outputActionId: "demo.extract", position: { x: 240, y: 0 } }
    ],
    edges: [{ key: "open_extract", source: { nodeKey: "open", portId: "success" }, target: { nodeKey: "extract", portId: "in" } }]
  };
  return {
    plan: {
      schemaVersion: "0.1",
      router: { name: "Queue router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [{ ...primary, nodes: primary.nodes.map(({ position: _position, ...node }) => node) }]
    },
    risk: "low",
    subflows: [primary]
  };
}

function adaptation(overrides: Partial<AutomationStudioBootstrapAdaptation> = {}): AutomationStudioBootstrapAdaptation {
  const plan = buildPlan();
  return {
    schemaVersion: "0.1",
    kind: "flow_bootstrap",
    adaptationId: ADAPTATION_ID,
    projectId: "project.demo",
    flowId: "flow.queue",
    baseDependencyDigest: "digest.base",
    baseSettingsRevision: 3,
    sourceInstructionIds: ["instruction.queue"],
    summary: "Read the queue.",
    riskLevel: "low",
    buildPlan: plan,
    topology: normalizeAutomationStudioFlowBuildPlan({
      adaptationId: ADAPTATION_ID,
      parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: "flow.queue", projectId: "project.demo", name: "Queue", now: CREATED_AT }),
      buildPlan: plan,
      sourceInstructionIds: ["instruction.queue"],
      now: CREATED_AT
    }),
    status: "proposed",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    auditEvents: [],
    ...overrides
  };
}

const BINDING = { executionDigest: "digest.current", settingsRevision: 4 };

describe("bootstrapAdaptationAsFlowAdaptation", () => {
  it("shows a proposed build as a Router edit and one created Subflow per plan Subflow", () => {
    const record = adaptation();
    const projected = bootstrapAdaptationAsFlowAdaptation(record, BINDING);
    const subflow = record.topology.subflows[0]!;
    expect(projected.patch).toEqual([
      {
        kind: "edit_router",
        targetId: record.topology.router.routerId,
        summary: "Create Router Queue router with 0 rules.",
        after: { routerId: record.topology.router.routerId, name: "Queue router", ruleCount: 0, fallbackKind: "subflow" }
      },
      {
        kind: "create_subflow",
        targetId: subflow.subflow.subflowId,
        summary: "Create Primary with 2 nodes and 1 edges.",
        after: { subflowId: subflow.subflow.subflowId, graphFlowId: subflow.graphFlow.flowId, name: "Primary", role: "primary", nodeCount: 2, edgeCount: 1 }
      }
    ]);
    expect(projected).not.toHaveProperty("appliedTo");
    expect(projected).toMatchObject({ status: "proposed", author: "llm", trigger: "Instruction-built Flow Bootstrap", diagnosis: "Read the queue.", sourceInstructionIds: ["instruction.queue"] });
    expect(projected.metadata).toEqual({
      adaptationKind: "flow_bootstrap",
      bootstrap: {
        baseExecutionDigest: "digest.base",
        baseSettingsRevision: 3,
        currentExecutionDigest: "digest.current",
        currentSettingsRevision: 4,
        routerId: record.topology.router.routerId,
        subflowCount: 1,
        nodeCount: 2,
        edgeCount: 1
      },
      phase9: { auditEvents: [], auditTotal: 0, approvalMode: "manual_approval" }
    });
  });

  it("names what an applied build changed and summarizes the application without its before-state", () => {
    const record = adaptation({
      status: "applied",
      application: { appliedAt: CREATED_AT + 5, appliedBy: "reviewer", appliedDependencyDigest: "digest.applied", parentBefore: { updatedAt: CREATED_AT } }
    });
    const projected = bootstrapAdaptationAsFlowAdaptation(record, BINDING);
    expect(projected.appliedTo).toEqual([
      { kind: "router", id: record.topology.router.routerId },
      { kind: "subflow", id: record.topology.subflows[0]!.subflow.subflowId }
    ]);
    expect(projected.metadata?.bootstrap).toMatchObject({ application: { appliedAt: CREATED_AT + 5, appliedBy: "reviewer", appliedExecutionDigest: "digest.applied" } });
    expect(JSON.stringify(projected)).not.toContain("parentBefore");
  });

  it("refuses a record that carries recording provenance", () => {
    const record = adaptation({ reusableContext: { recordingId: "recording.1" } });
    expect(() => bootstrapAdaptationAsFlowAdaptation(record, BINDING)).toThrow("recording or timeline provenance");
  });
});

describe("sanitizedBootstrapAccounting", () => {
  it("keeps bounded usage and trims its text", () => {
    expect(sanitizedBootstrapAccounting({ requestId: " request.1 ", estimatedInputTokens: 10, provider: "deepseek", totalTokens: 12, estimatedCostUsd: 0.01 }))
      .toEqual({ requestId: "request.1", estimatedInputTokens: 10, provider: "deepseek", totalTokens: 12, estimatedCostUsd: 0.01 });
  });

  it("refuses usage it cannot bound", () => {
    expect(() => sanitizedBootstrapAccounting({ requestId: "request.1", estimatedInputTokens: -1 })).toThrow("Flow Bootstrap estimated input tokens is invalid.");
    expect(() => sanitizedBootstrapAccounting({ requestId: "request\u0000", estimatedInputTokens: 1 })).toThrow("Flow Bootstrap request ID is invalid.");
    expect(() => sanitizedBootstrapAccounting({ requestId: "request.1", estimatedInputTokens: 1, estimatedCostUsd: 11 })).toThrow("Flow Bootstrap estimated cost is invalid.");
  });
});
