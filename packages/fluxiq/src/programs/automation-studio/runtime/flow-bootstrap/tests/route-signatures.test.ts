// The route signatures a build recorded reach the Flow node (t243): from the
// draft step, through the plan node and the validated build plan, to the node's
// metadata under `routeSignatures`, which a run reads to continue at the node
// whose expected pre-state matches the page.
//
// Apply re-validates the stored plan and requires the result to equal the
// stored build plan, and its normalization the stored topology, byte for byte
// (`service.ts`, apply). So the signatures must come back out of validation
// exactly as they went in, or every build that recorded one could never be
// applied.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../model/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY, automationStudioNodeRouteSignatures } from "../../route-state/index.ts";
import { webDomainNodeDefinitionsFixture } from "../plan/tests/index.ts";
import {
  assembleAutomationStudioFlowDraftPlan,
  normalizeAutomationStudioFlowBuildPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBuildPlan,
  type AutomationStudioFlowDraftWrittenStep
} from "../index.ts";

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const ADAPTATION_ID = "adaptation.bootstrap.7d0c3e1a-5b2f-4a8e-9c6d-1e2f3a4b5c6d";
const CREATED_AT = 1_700_000_000_000;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const step = (position: number): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId: "press", input: { target: `#control-${position}` },
  effect: "mutate", effectApplied: true, disposition: "kept", stateBefore: `D${position - 1}`, stateAfter: `D${position}`
});
const write = (draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep => ({
  description: "press the control", node: "web.dom.click", entries: [{ key: "selector", value: String(draftStep.input.target) }]
});
// The second step started on a page the build never signed.
const signed: Record<string, { at: string }> = { D0: { at: "/home" }, D1: { at: "/search" }, D2: { at: "/results" } };
const routeSignaturesOf = (draftStep: { stateBefore?: string; stateAfter?: string }) => {
  const before = draftStep.stateBefore === "D1" ? undefined : signed[draftStep.stateBefore ?? ""];
  const after = signed[draftStep.stateAfter ?? ""];
  return before || after ? { ...(before ? { before } : {}), ...(after ? { after } : {}) } : undefined;
};

function storedBuildPlan(): AutomationStudioFlowBuildPlan {
  const assembled = assembleAutomationStudioFlowDraftPlan({ steps: [step(1), step(2)], write, registry, resolution, summary: "Press twice", routeSignaturesOf });
  if (!assembled.plan) throw new Error(`expected a plan: ${assembled.issues.map((issue) => issue.code).join(", ")}`);
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan, registry, resolution });
  if (!validated.validated) throw new Error(`expected a valid plan: ${validated.issues.map((issue) => issue.code).join(", ")}`);
  return JSON.parse(JSON.stringify(validated.validated)) as AutomationStudioFlowBuildPlan;
}

const normalize = (buildPlan: AutomationStudioFlowBuildPlan) => normalizeAutomationStudioFlowBuildPlan({
  adaptationId: ADAPTATION_ID,
  parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: "flow.store", projectId: "project.demo", name: "Store", now: CREATED_AT }),
  buildPlan, sourceInstructionIds: ["instruction.1"], now: CREATED_AT
});

describe("a node's route signatures, from the plan to the Flow", () => {
  it("carries them through validation onto the laid-out build plan", () => {
    const buildPlan = storedBuildPlan();
    expect(buildPlan.subflows[0]?.nodes.map((node) => node.routeSignatures)).toEqual([
      { before: { at: "/home" }, after: { at: "/search" } },
      { after: { at: "/results" } }
    ]);
  });

  it("writes them to each node's metadata under the key a run reads", () => {
    const topology = normalize(storedBuildPlan());
    const nodes = topology.subflows[0]!.graphFlow.nodes;
    expect(nodes.map((node) => node.metadata?.[AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY])).toEqual([
      { before: { at: "/home" }, after: { at: "/search" } },
      { after: { at: "/results" } }
    ]);
    expect(nodes.map((node) => automationStudioNodeRouteSignatures(node))).toEqual([
      { before: { at: "/home" }, after: { at: "/search" } },
      { after: { at: "/results" } }
    ]);
  });

  it("survives apply's round trip: re-validating the stored plan gives the stored build plan and topology", () => {
    const stored = storedBuildPlan();
    const topology = JSON.parse(JSON.stringify(normalize(stored))) as unknown;
    const again = validateAutomationStudioFlowBootstrapPlan({ plan: stored.plan, registry, resolution });
    expect(again.ok).toBe(true);
    expect(stableJson(again.validated)).toBe(stableJson(stored));
    expect(stableJson(normalize(again.validated!))).toBe(stableJson(topology));
  });

  it("writes no key for a node that recorded none", () => {
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps: [step(1)], write, registry, resolution, summary: "Press once" });
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: assembled.plan!, registry, resolution });
    const node = normalize(validated.validated!).subflows[0]!.graphFlow.nodes[0]!;
    expect(node.metadata && AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY in node.metadata).toBe(false);
  });
});
