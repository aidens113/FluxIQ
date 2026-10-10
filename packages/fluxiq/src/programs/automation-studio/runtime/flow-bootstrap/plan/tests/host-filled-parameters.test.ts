import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import {
  automationStudioFlowBootstrapIssueFeedback,
  buildAutomationStudioFlowBootstrapContext,
  type AutomationStudioFlowBootstrapIssue,
  type AutomationStudioFlowBootstrapPlan
} from "../index.ts";

// A parameter the host fills from what the model names (`shownToModel: false`,
// t432) is never shown to a model: not in the catalog entry `core.describe_nodes`
// and the build's catalog read, and not as the shape a refused parameter
// accepts. The user's rule (2026-10-10): the model names an element by the
// handle the page view printed, and the rest "is all handled by extension".
// The node still declares the parameter, so a Flow that holds it validates.
// The definition is a made-up library's, not the web domain's.

const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [] as string[], permissions: [] as string[] };

const press: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "demo.press",
  version: "1.0.0",
  label: "Press",
  description: "Press the control its target names.",
  category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "demo.press" },
  availability: { kind: "domain", domainId: "demo" },
  capabilities: { executable: true },
  inputs: [],
  outputs: [],
  parameters: [
    { id: "target", label: "Target", valueType: "object", description: "The control, by its handle.", example: { handle: "t5" } },
    { id: "address", label: "Address", valueType: "string", required: true, shownToModel: false },
    { id: "identity", label: "Identity", valueType: "object", description: "Who the control is.", shownToModel: false },
    { id: "pause", label: "Pause", valueType: "number", defaultValue: 0 }
  ]
};
const registry = new AutomationStudioNodeRegistry([press]);

function planWith(parameters: JsonObject): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Press", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "press", definitionId: "demo.press", definitionVersion: "1.0.0", parameters }], edges: [] }]
  };
}

function feedbackOn(parameterPath: string, code: string): JsonObject[] {
  const plan = planWith({ target: { handle: "t5" }, address: "#x" });
  const issues: AutomationStudioFlowBootstrapIssue[] = [{ severity: "error", code, message: "refused", path: `plan.subflows.0.nodes.0.parameters${parameterPath}` }];
  return automationStudioFlowBootstrapIssueFeedback({ issues, plan, registry, resolution });
}

describe("a parameter the host fills from what the model names", () => {
  it("is left out of the catalog entry, which keeps every parameter the model may write", () => {
    const [entry] = buildAutomationStudioFlowBootstrapContext({ registry, resolution }).nodeCatalog;
    expect(entry?.parameters.map((parameter) => parameter.id)).toEqual(["target", "pause"]);
    expect(entry?.parameters[0]).toEqual({ id: "target", type: "object", description: "The control, by its handle.", example: { handle: "t5" } });
    expect(JSON.stringify(entry)).not.toMatch(/address|identity|Who the control is/u);
  });

  it("is never given as the shape a refused parameter accepts", () => {
    const [named] = feedbackOn(".address", "demo.refused");
    expect(named).toEqual({ code: "demo.refused", path: "plan.subflows.0.nodes.0.parameters.address" });
    // A domain refusal placed on the parameters, positioned at the hidden one.
    const [positioned] = feedbackOn("", "demo.handle.not_a_handle:address");
    expect(positioned).not.toHaveProperty("accepted");
  });

  it("is not among the parameters an undeclared one is answered with", () => {
    const [unknown] = feedbackOn(".colour", "bootstrap.unknown_parameter");
    expect(unknown?.accepted).toEqual({ parameters: ["target", "pause"] });
  });

  it("still gives a shown parameter's shape", () => {
    const [shown] = feedbackOn(".target", "demo.refused");
    expect(shown?.accepted).toEqual({ parameter: "target", type: "object", description: "The control, by its handle.", example: { handle: "t5" } });
  });
});
