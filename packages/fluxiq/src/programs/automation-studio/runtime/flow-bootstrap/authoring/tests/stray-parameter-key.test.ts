// A key written beside a parameter instead of inside it.
//
// The live creation campaign of 2026-09-17 refused builds with
// `bootstrap.unknown_parameter` for a bare `fields:` or `paginate:` line --
// the very words the list-detection tool's own description uses -- because
// each belongs inside `extractList`. Two things were wrong and both are held
// here: where exactly one structured parameter declares the key in its own
// example, the line is read as having been written inside it; and where no
// parameter claims it, the refusal names the parameters the node does declare,
// which is all the model has to correct from. Before this, a refused Flow
// script fed back a path into a plan the model never wrote and nothing else,
// and live builds wrote the same key again until the budget ended them.
//
// The narrowing shape is held alongside, because it is what the campaign never
// produced: a script that chooses an option, presses a control and then reads
// what is left builds and validates, so nothing in the authoring path was ever
// what stopped one being written.

import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { automationStudioFlowBootstrapIssueFeedback } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";

const definitions = [...webDomainNodeDefinitionsFixture(), ...canonicalBuiltinAutomationNodeDefinitions];
const registry = new AutomationStudioNodeRegistry(definitions);
const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

function accept(flow: string) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { summary: "s", flow }, registry, resolution });
}

/** The parameters of the one node a one-step script builds. */
function parametersOf(flow: string): JsonObject | undefined {
  const accepted = accept(flow);
  expect(accepted.ok).toBe(true);
  return accepted.ok ? accepted.plan.subflows[0]?.nodes[0]?.parameters : undefined;
}

describe("a key written beside the parameter that declares it", () => {
  it("is read as having been written inside it", () => {
    const parameters = parametersOf([
      "flow: Read the rows",
      "step: read the rows",
      "  node: web.dom.extract_list",
      "  extractList: extraction.1",
      "  fields.title: title",
      "  paginate: false",
      "  minItems: 0"
    ].join("\n"));
    const list = parameters?.extractList as JsonObject;
    expect(list.handle).toBe("extraction.1");
    expect(list.fields).toEqual({ title: "title" });
    expect(list.paginate).toBe(false);
    // `0` under a dotted key is a count, not `false`: see `../values.ts`.
    expect(list.minItems).toBe(0);
  });

  it("resolves a parameter name the model misspelled, on the path that actually reads it", () => {
    // The plan's own correction runs later than this reader, and a key refused
    // here never reaches it, so the whole feature was inert on the live
    // creation path until this reader learned to resolve too.
    const accepted = accept([
      "flow: Press the filter",
      "step: press the filter",
      "  node: web.dom.click",
      "  targe: target.7"
    ].join("\n"));
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    // Resolved to `target`, and then coerced exactly as a correctly written
    // key would have been: the handle takes its own shape, so a corrected name
    // reaches the node as a real parameter rather than as raw text.
    expect(accepted.plan.subflows[0]?.nodes[0]?.parameters).toMatchObject({ target: { handle: "target.7" } });
  });

  it("does not move a key no parameter's example declares", () => {
    const accepted = accept([
      "flow: Press the filter",
      "step: press the filter",
      "  node: web.dom.click",
      "  target: target.7",
      "  location: https://shop.test/orders"
    ].join("\n"));
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.issues.map((issue) => issue.code)).toContain("bootstrap.unknown_parameter");
  });
});

describe("a refused Flow script", () => {
  it("feeds back the parameters the node does declare", () => {
    const accepted = accept([
      "flow: Press the filter",
      "step: press the filter",
      "  node: web.dom.click",
      "  target: target.7",
      "  location: https://shop.test/orders"
    ].join("\n"));
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.refusedPlan).toBeDefined();
    const feedback = automationStudioFlowBootstrapIssueFeedback({
      issues: accepted.issues,
      plan: accepted.refusedPlan,
      registry,
      resolution
    });
    const named = feedback.find((entry) => entry.code === "bootstrap.unknown_parameter");
    expect((named?.accepted as { parameters: string[] } | undefined)?.parameters).toContain("target");
  });
});

describe("a Flow that narrows before it reads", () => {
  it("builds from a script that chooses an option, presses a control and then extracts", () => {
    const accepted = accept([
      "flow: List only the orders still awaiting dispatch",
      "step: open the orders page",
      "  node: web.browser.navigate",
      "  url: https://shop.test/orders",
      "step: set the status filter",
      "  node: web.dom.select",
      "  target: target.4",
      "  value: awaiting-dispatch",
      "step: apply the filter",
      "  node: web.dom.click",
      "  target: target.5",
      "step: read what is left",
      "  node: web.dom.extract_list",
      "  extractList: extraction.1",
      "  extractList.minItems: 0"
    ].join("\n"));
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const nodes = accepted.plan.subflows[0]?.nodes ?? [];
    expect(nodes.map((node) => node.outputActionId)).toEqual([
      "web.browser.navigate",
      "web.dom.select",
      "web.dom.click",
      "web.dom.extract_list"
    ]);
    const chosen = nodes[1]?.parameters?.target as JsonValue;
    expect(chosen).toEqual({ handle: "target.4" });
    expect((nodes[3]?.parameters?.extractList as JsonObject).minItems).toBe(0);
  });
});

// A plan node's reset witness is Core-derived (t751, R3 door 2): a model can
// never write one. A `resetWitness:` line is refused as the unknown key it is
// -- even beside a parameter whose name is one letter away, which nearness
// would otherwise take -- and a JSON plan's node field of that name reaches no
// node.
describe("a reset witness the model wrote", () => {
  const near: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
    source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
    inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [{ id: "resetWitnes", label: "Reset witnes", valueType: "string" }, { id: "text", label: "Text", valueType: "string" }]
  };
  const demo = { registry: new AutomationStudioNodeRegistry([near]), resolution: { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] } };

  it("is refused as an unknown key in a Flow script, never read as the nearest parameter", () => {
    for (const key of ["resetWitness", "reset witness", "reset_witness"]) {
      const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { summary: "s", flow: ["flow: Press", "step: press it", "  node: domain.demo.press", `  ${key}: control`].join("\n") }, ...demo });
      expect(accepted.ok, key).toBe(false);
      if (accepted.ok) continue;
      expect(accepted.issues.map((issue) => issue.code), key).toContain("bootstrap.unknown_parameter");
      expect(JSON.stringify(accepted.refusedPlan ?? {}), key).not.toContain("resetWitnes\"");
    }
    // The same nearness still corrects a real slip.
    const slip = acceptAutomationStudioFlowBootstrapResult({ result: { summary: "s", flow: ["flow: Press", "step: press it", "  node: domain.demo.press", "  resetWitnss: noted"].join("\n") }, ...demo });
    expect(slip.ok && slip.plan.subflows[0]?.nodes[0]?.parameters).toMatchObject({ resetWitnes: "noted" });
  });

  it("is refused among a JSON plan's parameters and dropped as a JSON plan's node field", () => {
    const plan = (node: JsonObject) => ({ summary: "s", plan: { subflows: [{ key: "main", name: "Main", nodes: [node] }] } });
    const inParameters = acceptAutomationStudioFlowBootstrapResult({ result: plan({ key: "s1", definitionId: "domain.demo.press", parameters: { resetWitness: { via: "control" } } }), ...demo });
    expect(inParameters.ok).toBe(false);
    if (!inParameters.ok) expect(inParameters.issues.map((issue) => issue.code)).toContain("bootstrap.unknown_parameter");
    const asField = acceptAutomationStudioFlowBootstrapResult({ result: plan({ key: "s1", definitionId: "domain.demo.press", resetWitness: { via: "control" }, parameters: { text: "hi" } }), ...demo });
    expect(asField.ok, JSON.stringify(asField)).toBe(true);
    if (asField.ok) {
      expect(asField.plan.subflows[0]?.nodes[0]).not.toHaveProperty("resetWitness");
      expect(asField.plan.subflows[0]?.nodes[0]?.parameters).not.toHaveProperty("resetWitnes");
    }
  });
});
