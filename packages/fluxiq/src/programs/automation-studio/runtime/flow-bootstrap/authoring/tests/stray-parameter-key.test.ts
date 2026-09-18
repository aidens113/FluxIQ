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
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
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
