import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../flow-draft/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../../../flow-bootstrap/plan/tests/index.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../../../bootstrap-completion.ts";

const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, ...webDomainNodeDefinitionsFixture()]);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

function step(position: number, selector: string, overrides: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  const input: JsonObject = { node: "web.output.dom-click", parameters: { selector }, consequences: [] };
  return { position, id: `d${position}`, iteration: position, actionId: "web.output.dom-click", toolId: "core.run_node", input, ranWith: input,
    effect: "mutate", effectApplied: true, disposition: "kept", ...overrides };
}

const draft = () => [step(2, "optional-control", { routing: { kind: "optional" } }), step(5, "withdrawn-control", { disposition: "dropped" }), step(8, "primary-control")];
const complete = (draftSteps: AutomationStudioFlowDraftStep[], binding?: Parameters<typeof checkAutomationStudioFlowBootstrapCompletion>[0]["binding"]) => checkAutomationStudioFlowBootstrapCompletion({
  result: { summary: "Press the controls." }, projectId: "project.fixture", flowId: "flow.fixture", registry, resolution, draftSteps, binding
});

describe("completion feedback for an assembled draft", () => {
  it("names the actual refused draft step after an optional join, retaining the original code and plan path", async () => {
    const verdict = await complete(draft(), { resolvePlanNodeParameters: ({ parameters }) => parameters.selector === "primary-control"
      ? { status: "refused", issueCodes: ["example.handle.ambiguous:parameters"] }
      : { status: "resolved", parameters } });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("Expected parameter refusal");
    expect(verdict.code).toBe("flow_bootstrap.evidence_completion_parameters_unresolved");
    expect(verdict.check.issueCodes).toEqual(["example.handle.ambiguous:parameters"]);
    const feedback = verdict.check.feedback as JsonObject;
    expect(feedback.issues).toEqual([{ code: "example.handle.ambiguous:parameters", path: "plan.subflows.0.nodes.2.parameters",
      step: "web.output.dom-click", draftStep: 8, draftStepId: "d8", nodeDefinition: "web.output.dom-click" }]);
    expect(JSON.stringify(feedback.issues)).not.toContain("primary-control");
    expect(verdict.locator?.nodes["0.1"]).toBeUndefined();
  });

  it("retains the mapping when authoring refuses an unknown parameter before domain resolution", async () => {
    const steps = draft();
    steps[2] = { ...steps[2]!, settings: { notAParameter: "private-value" } };
    const verdict = await complete(steps);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) throw new Error("Expected authoring refusal");
    const feedback = verdict.check.feedback as JsonObject;
    expect(feedback.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "bootstrap.unknown_parameter",
      path: "plan.subflows.0.nodes.2.parameters.notAParameter", draftStep: 8, draftStepId: "d8", nodeDefinition: "web.output.dom-click" })]));
    expect(JSON.stringify(feedback.issues)).not.toContain("private-value");
  });

  it("carries the same original mapping on an accepted draft for later checks", async () => {
    const verdict = await complete(draft());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) throw new Error("Expected accepted draft");
    expect(verdict.locator?.nodes["0.2"]).toEqual({ step: "web.output.dom-click", draftStep: 8, draftStepId: "d8", nodeDefinition: "web.output.dom-click" });
    expect(verdict.locator?.nodes["0.1"]).toBeUndefined();
    expect(JSON.stringify(verdict.buildPlan)).not.toContain("draftStepId");
  });
});
