// A text value never matches an object parameter by name (t514).
//
// `state: absent` on a wait step was resolved to `expectedState` (score 0.739,
// `how: "nearest"`), an object parameter that no text fits; the object reader
// then made the word a handle. The value's shape rules such a match out. A
// handle written under a misspelled name for the one parameter that takes a
// handle is still that parameter's, and an object still finds its object
// parameter.

import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { automationStudioMatchWrittenParameterName, correctAutomationStudioFlowBootstrapPlanNames, type AutomationStudioFlowBootstrapPlan } from "../index.ts";
import { waitNodeDefinitionFixture, WAIT_NODE_DEFINITION_ID } from "./index.ts";

const definition = waitNodeDefinitionFixture();
const none: ReadonlySet<string> = new Set();

describe("a written name and the shape of its value", () => {
  it("does not match text to an object parameter", () => {
    expect(automationStudioMatchWrittenParameterName("state", "absent", definition, none)).toBeUndefined();
    expect(automationStudioMatchWrittenParameterName("expectedStat", "absent", definition, none)).toBeUndefined();
  });

  it("still matches an object to the object parameter it nearly names", () => {
    expect(automationStudioMatchWrittenParameterName("expectedStat", { facts: [] }, definition, none)).toMatchObject({ id: "expectedState" });
  });

  it("still matches a handle to the parameter that takes one", () => {
    expect(automationStudioMatchWrittenParameterName("targt", "t846", definition, none)).toMatchObject({ id: "target" });
  });

  it("leaves a text value under an unknown name in a JSON plan as written, for validation to refuse", () => {
    const plan: AutomationStudioFlowBootstrapPlan = {
      schemaVersion: "0.1",
      router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
      subflows: [{
        key: "main",
        name: "Main",
        role: "primary",
        nodes: [{ key: "wait", definitionId: WAIT_NODE_DEFINITION_ID, definitionVersion: "1.0.0", parameters: { target: { handle: "t846" }, state: "absent" }, outputActionId: "demo.wait" }],
        edges: []
      }]
    };
    const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, definition]);
    const corrected = correctAutomationStudioFlowBootstrapPlanNames({ plan, registry, resolution: { scope: { kind: "domain", domainId: "demo" }, runtimeCapabilities: [], permissions: [] } });
    expect(corrected.assumptions).toEqual([]);
    expect(corrected.plan.subflows[0]?.nodes[0]?.parameters).toEqual({ target: { handle: "t846" }, state: "absent" });
  });
});
