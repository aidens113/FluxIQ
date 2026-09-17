import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { automationStudioNodeAdaptationIds, decideAutomationStudioChangeConfidence } from "../../flow-change/index.ts";
import {
  assertAutomationStudioBootstrapHasNoRecordingProvenance,
  normalizeAutomationStudioFlowBuildPlan,
  upgradeAutomationStudioBootstrapAdaptation,
  type AutomationStudioBootstrapAdaptation,
  type AutomationStudioBootstrapTopology,
  type AutomationStudioFlowBuildPlan
} from "../index.ts";

const ADAPTATION_ID = "adaptation.bootstrap.4c1d7a52-0e0b-4f6e-9f0a-3b1f5a2c9d11";
const CREATED_AT = 1_700_000_000_000;

// Object keys sorted, arrays in order: the comparison apply makes between a
// stored topology and a fresh normalization.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function parentFlow(): AutomationStudioFlowArtifact {
  return createBlankAutomationStudioFlowArtifact({ flowId: "flow.catalog", projectId: "project.demo", name: "Catalog", now: CREATED_AT });
}

function buildPlan(): AutomationStudioFlowBuildPlan {
  const primary = {
    key: "primary",
    name: "Primary",
    role: "primary" as const,
    nodes: [
      { key: "open", definitionId: "domain.demo.open", definitionVersion: "1.0.0", parameters: { url: "https://example.test/catalog" }, outputActionId: "demo.open", position: { x: 0, y: 0 } },
      { key: "extract", definitionId: "domain.demo.extract", definitionVersion: "1.0.0", outputActionId: "demo.extract", position: { x: 240, y: 0 } }
    ],
    edges: [{ key: "open_extract", source: { nodeKey: "open", portId: "success" }, target: { nodeKey: "extract", portId: "in" } }]
  };
  const recovery = {
    key: "recovery",
    name: "Recovery",
    role: "recovery" as const,
    nodes: [{ key: "dismiss", definitionId: "domain.demo.click", definitionVersion: "1.0.0", position: { x: 0, y: 0 } }],
    edges: []
  };
  return {
    plan: {
      schemaVersion: "0.1",
      router: { name: "Catalog router", rules: [{ key: "blocked", name: "Blocked", targetSubflowKey: "recovery", routeTags: ["blocked"] }], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [
        { ...primary, nodes: primary.nodes.map(({ position: _position, ...node }) => node) },
        { ...recovery, nodes: recovery.nodes.map(({ position: _position, ...node }) => node) }
      ]
    },
    risk: "low",
    subflows: [primary, recovery]
  };
}

function normalize(adaptationId = ADAPTATION_ID): AutomationStudioBootstrapTopology {
  return normalizeAutomationStudioFlowBuildPlan({
    adaptationId,
    parentFlow: parentFlow(),
    buildPlan: buildPlan(),
    sourceInstructionIds: ["instruction.catalog"],
    now: CREATED_AT
  });
}

function withoutNodeProvenance(topology: AutomationStudioBootstrapTopology): AutomationStudioBootstrapTopology {
  const legacy = structuredClone(topology);
  for (const entry of legacy.subflows) {
    for (const node of entry.graphFlow.nodes) delete node.metadata?.adaptationIds;
  }
  return legacy;
}

// The shape a proposed record had on disk before modes, origins, validation
// results and node provenance existed.
function legacyRecord(): AutomationStudioBootstrapAdaptation {
  return {
    schemaVersion: "0.1",
    kind: "flow_bootstrap",
    adaptationId: ADAPTATION_ID,
    projectId: "project.demo",
    flowId: "flow.catalog",
    baseDependencyDigest: "digest.base",
    baseSettingsRevision: 3,
    sourceInstructionIds: ["instruction.catalog"],
    summary: "Open the catalog and extract its items.",
    riskLevel: "low",
    buildPlan: buildPlan(),
    topology: withoutNodeProvenance(normalize()),
    status: "validated",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT + 5,
    auditEvents: []
  };
}

describe("Flow Bootstrap normalization provenance", () => {
  it("stamps every node it creates with the adaptation id", () => {
    const topology = normalize();
    const nodes = topology.subflows.flatMap((entry) => entry.graphFlow.nodes);
    expect(nodes).toHaveLength(3);
    for (const node of nodes) {
      expect(node.metadata).toMatchObject({ adaptationIds: [ADAPTATION_ID], bootstrapAdaptationId: ADAPTATION_ID });
      expect(automationStudioNodeAdaptationIds(node.metadata)).toEqual([ADAPTATION_ID]);
    }
    expect(nodes[0]!.metadata).toEqual({
      adaptationIds: [ADAPTATION_ID],
      bootstrapAdaptationId: ADAPTATION_ID,
      bootstrapSymbolicKey: "open",
      outputActionId: "demo.open"
    });
  });

  it("stamps nodes only, never edges, Subflows, graphs or the Router", () => {
    const topology = normalize();
    expect(topology.router.metadata).not.toHaveProperty("adaptationIds");
    for (const entry of topology.subflows) {
      expect(entry.subflow.metadata).not.toHaveProperty("adaptationIds");
      expect(entry.graphFlow.metadata).not.toHaveProperty("adaptationIds");
      for (const edge of entry.graphFlow.edges) expect(edge.metadata).not.toHaveProperty("adaptationIds");
    }
  });

  it("stays deterministic, so apply can compare it with the stored topology", () => {
    expect(stableJson(normalize())).toBe(stableJson(normalize()));
  });

  it("refuses an adaptation id Core could not have minted", () => {
    expect(() => normalize(" adaptation.padded ")).toThrow(/well-formed adaptation id/);
  });
});

describe("upgrading a stored Flow Bootstrap adaptation", () => {
  it("makes a record written before node provenance match a fresh normalization again", () => {
    const legacy = legacyRecord();
    expect(stableJson(legacy.topology)).not.toBe(stableJson(normalize()));
    expect(stableJson(upgradeAutomationStudioBootstrapAdaptation(legacy).topology)).toBe(stableJson(normalize()));
  });

  it("reads a record without a mode or origin as a create from its source instructions", () => {
    const upgraded = upgradeAutomationStudioBootstrapAdaptation(legacyRecord());
    expect(upgraded.mode).toBe("create");
    expect(upgraded.origin).toEqual({ entryPoint: "instruction", instructionIds: ["instruction.catalog"] });
    expect(upgraded).not.toHaveProperty("validationResults");
  });

  it("keeps a mode, origin and validation results the record already has", () => {
    const current: AutomationStudioBootstrapAdaptation = {
      ...legacyRecord(),
      topology: normalize(),
      mode: "extend",
      origin: { entryPoint: "edge_case", instructionIds: [], runId: "run.empty-search" },
      validationResults: [{ runId: "run.trial", status: "succeeded", checkedAt: CREATED_AT + 1, kind: "trial", basis: ["records"] }]
    };
    expect(upgradeAutomationStudioBootstrapAdaptation(current)).toEqual(current);
  });

  it("derives no origin for a record with no source instruction", () => {
    const upgraded = upgradeAutomationStudioBootstrapAdaptation({ ...legacyRecord(), sourceInstructionIds: [] });
    expect(upgraded).not.toHaveProperty("origin");
    expect(upgraded.mode).toBe("create");
  });

  it("is idempotent and leaves its argument untouched", () => {
    const legacy = legacyRecord();
    const before = structuredClone(legacy);
    const once = upgradeAutomationStudioBootstrapAdaptation(legacy);
    expect(upgradeAutomationStudioBootstrapAdaptation(once)).toEqual(once);
    expect(legacy).toEqual(before);
    expect(once.topology).not.toBe(legacy.topology);
  });

  it("stamps only the nodes this adaptation owns", () => {
    const legacy = legacyRecord();
    const foreign = legacy.topology.subflows[1]!.graphFlow.nodes[0]!;
    foreign.metadata = { bootstrapAdaptationId: "adaptation.bootstrap.other" };
    const upgraded = upgradeAutomationStudioBootstrapAdaptation(legacy);
    expect(upgraded.topology.subflows[1]!.graphFlow.nodes[0]!.metadata).toEqual({ bootstrapAdaptationId: "adaptation.bootstrap.other" });
    expect(upgraded.topology.subflows[0]!.graphFlow.nodes.every((node) => automationStudioNodeAdaptationIds(node.metadata)?.[0] === ADAPTATION_ID)).toBe(true);
  });

  it("does not throw for a record whose id Core could not have minted", () => {
    const odd = { ...legacyRecord(), adaptationId: "adaptation\nodd" };
    for (const entry of odd.topology.subflows) {
      for (const node of entry.graphFlow.nodes) node.metadata = { ...node.metadata, bootstrapAdaptationId: odd.adaptationId };
    }
    const upgraded = upgradeAutomationStudioBootstrapAdaptation(odd);
    expect(upgraded.mode).toBe("create");
    expect(stableJson(upgraded.topology)).toBe(stableJson(odd.topology));
  });

  it("keeps the new fields clear of the recording-provenance guard and intact through JSON", () => {
    const upgraded: AutomationStudioBootstrapAdaptation = {
      ...upgradeAutomationStudioBootstrapAdaptation(legacyRecord()),
      validationResults: [{ runId: "run.trial", status: "succeeded", checkedAt: CREATED_AT + 1, kind: "trial", basis: ["records", "downstream_assertion"] }]
    };
    expect(() => assertAutomationStudioBootstrapHasNoRecordingProvenance(upgraded)).not.toThrow();
    expect(JSON.parse(JSON.stringify(upgraded))).toEqual(upgraded);
    expect(decideAutomationStudioChangeConfidence({ validationResults: upgraded.validationResults!, riskLevel: upgraded.riskLevel }).tier).toBe("provisional");
  });
});
