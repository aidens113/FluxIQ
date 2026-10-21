// Which of exploration's views a plan node's handles may resolve from (t358,
// `../plan-parameter-resolution.ts`, `../bootstrap-completion.ts`).
//
// Lane A round 4 (`run-muyrpbnk-fef374e7`) had twelve candidate submissions
// refused for start-page popup handles exploration had been shown and then
// left. A caller may now ask the domain to resolve from the whole view history
// (`handleReach: "view_history"`, a candidate submission), and only an answer
// to such a resolution may say which view each handle came from. A legacy
// completion asks nothing new and accepts nothing new.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { checkAutomationStudioFlowBootstrapCompletion } from "../bootstrap-completion.ts";
import { AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES, resolveAutomationStudioFlowBootstrapPlanParameters } from "../plan-parameter-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
type Asked = Parameters<Resolver>[0];

const START = "https://shop.test/";
const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.press", version: "1.0.0", label: "Press", description: "Press one control", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "press" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "target", label: "Target", valueType: "object", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };

function plan(handles: string[]): AutomationStudioFlowBootstrapPlan {
  const nodes = handles.map((handle, index) => ({ key: `n${index}`, definitionId: definition.id, definitionVersion: definition.version, parameters: { target: { handle } } }));
  const edges = nodes.slice(1).map((node, index) => ({ key: `e${index}`, source: { nodeKey: nodes[index]!.key, portId: "success" }, target: { nodeKey: node.key, portId: "in" } }));
  return { schemaVersion: "0.1", router: { name: "Press", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] };
}

/** A domain that resolves every handle, and says which view each came from when, and only when, it was asked for the view history. */
function domain(asked: Asked[], answerViews: (input: Asked) => boolean = (input) => input.handleReach === "view_history"): Resolver {
  return (input) => {
    asked.push(input);
    const handle = String((input.parameters.target as JsonObject).handle);
    const parameters = { target: { selector: `#${handle}` } };
    return answerViews(input)
      ? { status: "resolved", parameters, handleViews: [{ handle, view: handle === "t478" ? 1 : 4, location: START }] }
      : { status: "resolved", parameters };
  };
}

/** `resolver` is anything a domain might send, as Core receives it: trusted for nothing. */
async function resolve(resolver: unknown, handleReach?: "view_history") {
  return resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: plan(["t478", "t925"]), projectId: "project.shop", flowId: "flow.cart", binding: { resolvePlanNodeParameters: resolver as Resolver }, handlesIssued: true,
    ...(handleReach ? { handleReach } : {})
  });
}

describe("resolving a plan's handles from exploration's view history", () => {
  it("asks the domain for the view history and returns which view each handle came from, by node", async () => {
    const asked: Asked[] = [];
    const resolved = await resolve(domain(asked), "view_history");
    expect(asked.map((input) => input.handleReach)).toEqual(["view_history", "view_history"]);
    expect(resolved).toMatchObject({ ok: true, resolvedNodeKeys: ["n0", "n1"] });
    if (!resolved.ok) return;
    expect(resolved.plan.subflows[0]!.nodes[0]!.parameters).toEqual({ target: { selector: "#t478" } });
    expect(resolved.handleViews).toEqual([
      { node: "primary.n0", handle: "t478", view: 1, location: START },
      { node: "primary.n1", handle: "t925", view: 4, location: START }
    ]);
  });

  it("sends nothing new without it, and refuses an answer that says which view a handle came from when nobody asked", async () => {
    const asked: Asked[] = [];
    const legacy = await resolve(domain(asked));
    expect(asked.every((input) => !Object.hasOwn(input, "handleReach"))).toBe(true);
    expect(legacy.ok && Object.keys(legacy).sort()).toEqual(["ok", "plan", "resolvedNodeKeys"]);

    const unasked = await resolve(domain([], () => true));
    expect(unasked.ok).toBe(false);
    if (!unasked.ok) expect(unasked.issues.map((issue) => issue.code)).toEqual([CODES.invalid, CODES.invalid]);
  });

  it("refuses views that are not a short list of exactly a handle, a view number from 1 and a location, even when asked", async () => {
    const bad = [
      [{ handle: "t478", view: 0, location: START }],
      [{ handle: "t478", view: 1.5, location: START }],
      [{ handle: "t 478", view: 1, location: START }],
      [{ handle: "t478", view: 1, location: "" }],
      [{ handle: "t478", view: 1, location: START, selector: "#leak" }],
      [],
      "t478"
    ];
    for (const handleViews of bad) {
      const refused = await resolve(() => ({ status: "resolved", parameters: { target: { selector: "#t478" } }, handleViews }), "view_history");
      expect(refused.ok, JSON.stringify(handleViews)).toBe(false);
    }
  });
});

describe("a completion check and the view history", () => {
  it("is asked for by a caller that says so, and the accepted verdict carries the views", async () => {
    const asked: Asked[] = [];
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Close the popup and collect the coupon", plan: plan(["t478", "t925"]) as unknown as JsonObject },
      projectId: "project.shop", flowId: "flow.cart", registry, resolution, binding: { resolvePlanNodeParameters: domain(asked) }, handleReach: "view_history"
    });
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.handleViews?.map((view) => [view.node, view.handle, view.view])).toEqual([["primary.n0", "t478", 1], ["primary.n1", "t925", 4]]);
  });

  it("is never asked for by a legacy completion, whose verdict is as it was", async () => {
    const asked: Asked[] = [];
    const verdict = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Close the popup and collect the coupon", plan: plan(["t478", "t925"]) as unknown as JsonObject },
      projectId: "project.shop", flowId: "flow.cart", registry, resolution, binding: { resolvePlanNodeParameters: domain(asked) }
    });
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
    expect(asked.length).toBe(2);
    expect(asked.every((input) => !Object.hasOwn(input, "handleReach"))).toBe(true);
    expect(Object.hasOwn(verdict, "handleViews")).toBe(false);
  });
});

// A candidate's node is told the plan's steps before it (t748 U1b, `../plan-parameter-resolution.ts`): every Subflow's
// nodes before it in plan order, as the plan held them -- handles intact, the step's own declaration taken off -- and
// with them the steps Core never asks about, an untouched inherited step and a handler whose fact was refused. A page
// fact's target is not a step, so it is in no list and is told none.
describe("the steps before a candidate's node", () => {
  const HANDLER = "builtin.control.handler";
  const GO = "domain.demo.go";
  const go = { url: `${START}cart` };
  const handler = { event: "retry", scope: { kind: "nodes", nodeIds: ["n0"] }, when: [{ fact: "exists", op: "exists", target: { handle: "t9" } }], order: 1, maxRuns: 1 };
  const node = (key: string, definitionId: string, parameters: JsonObject) => ({ key, definitionId, definitionVersion: "1.0.0", parameters });
  const subflow = (key: string, role: "primary" | "secondary", nodes: ReturnType<typeof node>[]) => ({ key, name: key, role, nodes, edges: [] });
  /** An inherited navigation, a handler whose fact the domain refuses, a press declaring nothing lasting on its parameters, another press; then a second Subflow's press. */
  function steps(): AutomationStudioFlowBootstrapPlan {
    return {
      schemaVersion: "0.1", router: { name: "Press", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [
        subflow("primary", "primary", [node("n0", GO, go), node("h1", HANDLER, handler), node("n1", definition.id, { target: { handle: "t478" }, consequences: "none" }), node("n2", definition.id, { target: { handle: "t925" } })]),
        subflow("later", "secondary", [node("m0", definition.id, { target: { handle: "t5" } })])
      ]
    } as AutomationStudioFlowBootstrapPlan;
  }
  /** Refuses the handler's fact; resolves every press; keeps a clone of what it was asked. */
  const standIn = (asked: Asked[]): Resolver => (input) => {
    asked.push({ ...structuredClone({ ...input, permission: undefined }), permission: input.permission });
    const handle = String((input.parameters.target as JsonObject | undefined)?.handle);
    if (handle === "t9") return { status: "refused", issueCodes: ["demo.handle_unknown"] };
    return { status: "resolved", parameters: { target: { selector: `#${handle}` } } };
  };
  const run = (asked: Asked[], plan: AutomationStudioFlowBootstrapPlan, handleReach?: "view_history") => resolveAutomationStudioFlowBootstrapPlanParameters({
    plan, projectId: "project.shop", flowId: "flow.cart", binding: { resolvePlanNodeParameters: standIn(asked) }, handlesIssued: true,
    inheritedNodeRefs: new Set(["primary.n0"]), permissionFor: () => async () => ({ permitted: true as const }), ...(handleReach ? { handleReach } : {})
  });

  it("sends each node of a candidate the steps before it in plan order, inherited and refused ones included, and a fact none", async () => {
    const asked: Asked[] = [];
    await run(asked, steps(), "view_history");
    const n0 = { definitionId: GO, parameters: go };
    const h1 = { definitionId: HANDLER, parameters: handler };
    const n1 = { definitionId: definition.id, parameters: { target: { handle: "t478" } } };
    const n2 = { definitionId: definition.id, parameters: { target: { handle: "t925" } } };
    // Asked, in order: the handler's fact, then n1, n2 and m0; never the inherited navigation or the refused handler.
    expect(asked.map((input) => [input.nodeDefinitionId, (input.parameters.target as JsonObject).handle])).toEqual([
      ["fluxiq.fact.target", "t9"], [definition.id, "t478"], [definition.id, "t925"], [definition.id, "t5"]
    ]);
    expect(Object.hasOwn(asked[0]!, "precedingSteps")).toBe(false);
    expect(asked.slice(1).map((input) => input.precedingSteps)).toEqual([[n0, h1], [n0, h1, n1], [n0, h1, n1, n2]]);
  });

  it("hands each node its own copy, so a domain that changes one changes nothing else", async () => {
    const asked: Asked[] = [];
    const plan = steps();
    await resolveAutomationStudioFlowBootstrapPlanParameters({
      plan, projectId: "project.shop", flowId: "flow.cart", handlesIssued: true, handleReach: "view_history", inheritedNodeRefs: new Set(["primary.n0"]),
      permissionFor: () => async () => ({ permitted: true as const }),
      binding: { resolvePlanNodeParameters: (input) => {
        const answer = standIn(asked)(input);
        for (const step of input.precedingSteps ?? []) (step.parameters as Record<string, unknown>).url = "changed";
        return answer;
      } }
    });
    expect(asked.at(-1)?.precedingSteps?.[0]).toEqual({ definitionId: GO, parameters: go });
    expect(plan.subflows[0]!.nodes[0]!.parameters).toEqual(go);
  });

  it("sends none without the view history", async () => {
    const asked: Asked[] = [];
    await run(asked, steps());
    expect(asked.length).toBe(4);
    expect(asked.some((input) => Object.hasOwn(input, "precedingSteps"))).toBe(false);
  });

  it("sends at most 200 steps, and none past them", async () => {
    const asked: Asked[] = [];
    const presses = Array.from({ length: 202 }, (_, index) => node(`p${index}`, definition.id, { target: { handle: `t${index + 1}` } }));
    const long = { ...steps(), subflows: [subflow("primary", "primary", presses)] } as AutomationStudioFlowBootstrapPlan;
    await run(asked, long, "view_history");
    expect(asked.length).toBe(202);
    expect(asked[200]!.precedingSteps?.length).toBe(200);
    expect(Object.hasOwn(asked[201]!, "precedingSteps")).toBe(false);
  });
});
