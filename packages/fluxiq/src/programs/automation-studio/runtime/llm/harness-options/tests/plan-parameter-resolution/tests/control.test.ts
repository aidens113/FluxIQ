// A handle's view may say its control is stateful (CC9, t799,
// `../../../plan-parameter-resolution.ts`): the domain's `control` is kept on a
// step's own view within its bounds, a field outside them dropped, a malformed
// one dropped whole, and none of it ever refuses the node. A page fact's view
// keeps none: a fact reads an element, it presses none. The stand-in is a
// reading-list library, whose "mark as read" control states its state.

import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioPlanHandleView } from "../../../binding.ts";
import { AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID } from "../../../plan-fact-targets.ts";
import { resolveAutomationStudioFlowBootstrapPlanParameters } from "../../../plan-parameter-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;

const SHELF = "https://library.test/shelf";
const ENSURES = { state: "opaque.read" };
const SHOWN = { state: "opaque.unread" };

function plan(parameters: JsonObject = { target: { handle: "t4" } }): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Mark", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [{ key: "mark", definitionId: "library.press", definitionVersion: "1.0.0", parameters, consequences: ["modify_existing"] }], edges: [] }]
  };
}

/** A library that resolves every handle and answers each view with `control` as given, for the step and for a fact alike. */
function library(control: unknown): Resolver {
  return ({ nodeDefinitionId, parameters }) => {
    const handle = String((parameters.target as JsonObject).handle);
    return {
      status: "resolved",
      parameters: { target: { selector: `#${handle}` } },
      handleViews: [{ handle, view: nodeDefinitionId === AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID ? 2 : 1, location: SHELF, control } as unknown as AutomationStudioPlanHandleView]
    };
  };
}

async function viewsOf(control: unknown, parameters?: JsonObject) {
  const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: plan(parameters), projectId: "project.library", flowId: "flow.shelf", binding: { resolvePlanNodeParameters: library(control) }, handlesIssued: true, handleReach: "view_history"
  });
  expect(resolved.ok, JSON.stringify(resolved)).toBe(true);
  return resolved.ok ? resolved.handleViews ?? [] : [];
}

describe("a view's stateful control", () => {
  it("is kept whole on the step's own view when within its bounds, as Core's own copy", async () => {
    const control = { stateful: true, state: "unread", shown: SHOWN, ensures: ENSURES, idempotentWith: "library.set_read" };
    const views = await viewsOf(control);
    expect(views).toEqual([{ node: "primary.mark", handle: "t4", view: 1, location: SHELF, control }]);
    expect(views[0]!.control!.ensures).not.toBe(ENSURES);
    expect(views[0]!.control!.shown).not.toBe(SHOWN);
  });

  it("drops each field outside its bound and keeps the rest, never refusing the node", async () => {
    const cases: Array<[JsonObject, JsonObject]> = [
      [{ stateful: true, state: "x".repeat(41), ensures: ENSURES }, { stateful: true, ensures: ENSURES }],
      [{ stateful: true, state: "", ensures: ENSURES }, { stateful: true, ensures: ENSURES }],
      [{ stateful: true, state: "un\nread" }, { stateful: true }],
      [{ stateful: true, state: "unread", ensures: {} }, { stateful: true, state: "unread" }],
      [{ stateful: true, ensures: { state: "x".repeat(4_100) } }, { stateful: true }],
      [{ stateful: true, ensures: ["opaque.read"] }, { stateful: true }],
      [{ stateful: true, shown: {}, ensures: ENSURES }, { stateful: true, ensures: ENSURES }],
      [{ stateful: true, shown: { state: "x".repeat(4_100) }, ensures: ENSURES }, { stateful: true, ensures: ENSURES }],
      [{ stateful: true, shown: ["opaque.unread"], ensures: ENSURES }, { stateful: true, ensures: ENSURES }],
      [{ stateful: true, ensures: ENSURES, idempotentWith: "not a node id" }, { stateful: true, ensures: ENSURES }],
      [{ stateful: true, idempotentWith: 7 }, { stateful: true }]
    ];
    for (const [sent, kept] of cases) expect((await viewsOf(sent))[0]!.control, JSON.stringify(sent)).toEqual(kept);
  });

  it("is dropped whole when not stateful, not an object, or carrying any other key, and the view is kept as before", async () => {
    const bad: JsonValue[] = [{ stateful: false, ensures: ENSURES }, { stateful: "true", ensures: ENSURES }, { ensures: ENSURES }, { stateful: true, ensures: ENSURES, selector: "#leak" }, "stateful", null, [ENSURES]];
    for (const control of bad) expect(await viewsOf(control), JSON.stringify(control)).toEqual([{ node: "primary.mark", handle: "t4", view: 1, location: SHELF }]);
  });

  it("is kept on no page fact's view, though the step's own fact names a stateful control", async () => {
    const control = { stateful: true, state: "unread", shown: SHOWN, ensures: ENSURES };
    const views = await viewsOf(control, { target: { handle: "t4" }, expectedState: { facts: [{ fact: "exists", target: { handle: "t9" } }] } });
    expect(views).toEqual([
      { node: "primary.mark", handle: "t9", view: 2, location: SHELF },
      { node: "primary.mark", handle: "t4", view: 1, location: SHELF, control }
    ]);
  });
});
