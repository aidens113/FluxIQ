// A span's `repeat pace:` is kept by the Flow it builds (t378): the line becomes
// the first step's plan node `paceMs`, survives parsing and validation, and is
// written to the Flow node's `metadata.paceMs`, the key every graph run reads a
// node's pace by (`../../executor/pacing/pace-metadata.ts`).
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_PACE_METADATA_KEY, automationStudioAuthoredPaceMs } from "../../executor/index.ts";
import { webDomainNodeDefinitionsFixture } from "../plan/tests/index.ts";
import {
  acceptAutomationStudioFlowBootstrapResult,
  normalizeAutomationStudioFlowBuildPlan,
  parseAutomationStudioFlowBootstrapPlan,
  validateAutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBuildPlan
} from "../index.ts";

const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

const PACED = [
  "flow: Confirm every request, six seconds apart",
  "step: open the requests",
  "  node: web.browser.navigate",
  "  url: https://social.test/requests",
  "step requests: list the requests",
  "  node: web.dom.extract_list",
  "  extractList: {\"item\": \".request\", \"fields\": {\"name\": \".name\"}}",
  "step: confirm the request",
  "  node: web.dom.click",
  "  selector: .confirm",
  "  consequences: modify_existing",
  "  repeat over: requests",
  "  repeat pace: 6 s"
].join("\n");

function graphNodes(buildPlan: AutomationStudioFlowBuildPlan) {
  const topology = normalizeAutomationStudioFlowBuildPlan({
    adaptationId: "adaptation.bootstrap.7d0c3e1a-5b2f-4a8e-9c6d-1e2f3a4b5c6d",
    parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: "flow.social", projectId: "project.demo", name: "Social", now: 1 }),
    buildPlan, sourceInstructionIds: ["instruction.1"], now: 1
  });
  return topology.subflows[0]!.graphFlow.nodes;
}

describe("a span's repeat pace in the Flow it builds", () => {
  it("lands as metadata.paceMs 6000 on the Flow node of the span's first step, and on no other", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: PACED }, registry, resolution });
    if (!accepted.ok) throw new Error(`expected the paced loop to assemble: ${accepted.issues.map((issue) => issue.code).join(", ")}`);
    expect(parseAutomationStudioFlowBootstrapPlan(JSON.parse(JSON.stringify(accepted.plan))).issues).toEqual([]);
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution });
    if (!validated.validated) throw new Error(`expected a valid plan: ${validated.issues.map((issue) => issue.code).join(", ")}`);
    const nodes = graphNodes(JSON.parse(JSON.stringify(validated.validated)) as AutomationStudioFlowBuildPlan);
    const paced = nodes.filter((node) => node.metadata?.[AUTOMATION_STUDIO_PACE_METADATA_KEY] !== undefined);
    expect(paced.map((node) => [node.definitionId, node.metadata?.[AUTOMATION_STUDIO_PACE_METADATA_KEY]])).toEqual([["web.output.dom-click", 6_000]]);
    // Read back exactly as a run reads it.
    expect(automationStudioAuthoredPaceMs(paced[0]!)).toBe(6_000);
  });

  it("writes no pace on a Flow whose plan says none", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: PACED.replace("\n  repeat pace: 6 s", "") }, registry, resolution });
    if (!accepted.ok) throw new Error("expected the loop to assemble");
    const validated = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution });
    expect(graphNodes(validated.validated!).some((node) => node.metadata?.[AUTOMATION_STUDIO_PACE_METADATA_KEY] !== undefined)).toBe(false);
  });
});
