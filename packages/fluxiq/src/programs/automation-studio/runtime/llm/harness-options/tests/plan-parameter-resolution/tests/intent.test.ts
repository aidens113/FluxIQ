import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../binding.ts";
import { AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID } from "../../../plan-fact-targets.ts";
import { resolveAutomationStudioFlowBootstrapPlanParameters } from "../../../plan-parameter-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
const VERSION = "1.0.0";
function plan(parameters: JsonObject = {}): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1", router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{ key: "main", name: "Main", role: "primary", nodes: [{ key: "press", definitionId: "library.press", definitionVersion: VERSION, parameters }], edges: [] }]
  };
}
function resolve(answer: unknown, written = plan(), extra: Partial<Parameters<typeof resolveAutomationStudioFlowBootstrapPlanParameters>[0]> = {}) {
  return resolveAutomationStudioFlowBootstrapPlanParameters({ plan: written, projectId: "project.library", flowId: "flow.library", handlesIssued: true,
    binding: { resolvePlanNodeParameters: (() => answer) as Resolver }, ...extra });
}
const resolved = (controlIntent: unknown) => ({ status: "resolved", parameters: {}, controlIntent });

describe("the host's resolved control intent", () => {
  it("keeps omission compatible, and snapshots every accepted closed value without changing executable parameters", async () => {
    const parameters = { selector: "#resolved", element: { accessibleName: "a control" } };
    const plain = await resolve({ status: "resolved", parameters });
    expect(plain.ok && plain.controlIntents).toBeUndefined();
    for (const sent of [{ intent: "accept" }, { intent: "accept", responseOnly: true }, { intent: "dismiss" }, { intent: "neutral" }, { intent: "navigate" }, Object.assign(Object.create(null) as object, { intent: "dismiss" })]) {
      const result = await resolve({ status: "resolved", parameters, controlIntent: sent });
      expect(result.ok).toBe(true);
      if (!result.ok || !plain.ok) continue;
      expect(result.plan).toEqual(plain.plan);
      expect(result.resolvedNodeKeys).toEqual(["press"]);
      const kept = [...result.controlIntents!.values()][0]!;
      expect(kept).toEqual(sent);
      expect(kept).not.toBe(sent);
      expect(Object.isFrozen(kept)).toBe(true);
      expect(Object.isFrozen(result.controlIntents)).toBe(true);
      expect("set" in result.controlIntents!).toBe(false);
      const snapshot = { ...kept };
      Object.assign(sent, { intent: "neutral" });
      expect(kept).toEqual(snapshot);
    }
  });

  it("refuses every malformed supplied record rather than treating it as absent, without running getters", async () => {
    const getter = vi.fn(() => "accept");
    const cases: unknown[] = [undefined, null, "accept", [], {}, { intent: "Accept" }, { intent: "accept", responseOnly: false }, { intent: "accept", responseOnly: undefined },
      { intent: "dismiss", responseOnly: true }, { intent: "neutral", responseOnly: undefined }, { intent: "navigate", responseOnly: false },
      { intent: "accept", extra: true }, { intent: "accept", [Symbol("extra")]: true }, Object.create({ intent: "accept" }),
      Object.assign(Object.create({ responseOnly: true }) as object, { intent: "accept" }),
      Object.defineProperty({}, "intent", { get: getter }), Object.defineProperty({ intent: "accept" }, "responseOnly", { get: getter }),
      Object.defineProperty({ intent: "accept" }, "extra", { value: true })];
    for (const sent of cases) expect(await resolve(resolved(sent))).toMatchObject({ ok: false, issues: [{ code: "bootstrap.parameter_resolution_invalid" }] });
    for (const sent of [Object.create({ controlIntent: { intent: "accept" } }, { status: { value: "resolved", enumerable: true }, parameters: { value: {}, enumerable: true } }),
      Object.defineProperty({ status: "resolved", parameters: {} }, "controlIntent", { get: getter })]) {
      expect(await resolve(sent)).toMatchObject({ ok: false, issues: [{ code: "bootstrap.parameter_resolution_invalid" }] });
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("only accepts the companion on a resolved outcome", async () => {
    for (const answer of [{ status: "unchanged", controlIntent: { intent: "accept", responseOnly: true } },
      { status: "resolved", parameters: {}, controlIntents: new Map([["another.node", { intent: "accept", responseOnly: true }]]) },
      { status: "refused", issueCodes: ["library.refused"], controlIntent: { intent: "dismiss" } },
      { status: "needs_permission", missing: ["move_money"], requestId: null, controlIntent: { intent: "neutral" } }]) {
      expect(await resolve(answer)).toMatchObject({ ok: false, issues: [{ code: "bootstrap.parameter_resolution_invalid" }] });
    }
  });

  it("associates each reply with its requested node, using noncolliding tuples even when both names contain dots", async () => {
    const written = plan();
    written.subflows[0]!.key = "a.b";
    written.subflows[0]!.nodes[0]!.key = "c";
    written.subflows[0]!.nodes[0]!.parameters = { own: "first" };
    written.subflows.push({ key: "a", name: "Second", role: "primary", nodes: [{ key: "b.c", definitionId: "library.press", definitionVersion: VERSION, parameters: { own: "second" } }], edges: [] });
    const asked: JsonObject[] = [];
    const result = await resolve(undefined, written, { binding: { resolvePlanNodeParameters: ({ parameters }) => {
      asked.push(parameters);
      return { status: "resolved", parameters, controlIntent: parameters.own === "first" ? { intent: "accept", responseOnly: true } : { intent: "accept" } };
    } } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.controlIntents!]).toEqual([[JSON.stringify(["a.b", "c"]), { intent: "accept", responseOnly: true }], [JSON.stringify(["a", "b.c"]), { intent: "accept" }]]);
    expect(asked).toEqual([{ own: "first" }, { own: "second" }]);
    expect(result.plan).toEqual(written);
    const duplicate = structuredClone(written);
    duplicate.subflows[1]!.key = "a.b";
    duplicate.subflows[1]!.nodes[0]!.key = "c";
    expect(await resolve(resolved({ intent: "accept" }), duplicate)).toMatchObject({ ok: false, issues: [{ code: "bootstrap.parameter_resolution_invalid" }] });
  });

  it("does not take authority from model parameter or plan metadata, unchanged or skipped inherited nodes, or fact replies", async () => {
    const parameters = { controlIntent: { intent: "accept", responseOnly: true }, element: { intent: "accept" } };
    const written = plan(parameters);
    written.subflows[0]!.nodes[0]!.metadata = {};
    Object.assign(written.subflows[0]!.nodes[0]!.metadata!, { controlIntent: { intent: "accept", responseOnly: true } });
    const untouched = await resolve({ status: "unchanged" }, written);
    expect(untouched.ok && untouched.controlIntents).toBeUndefined();
    const inherited = vi.fn(() => resolved({ intent: "accept" }));
    const skipped = await resolve(undefined, written, { inheritedNodeRefs: new Set(["main.press"]), binding: { resolvePlanNodeParameters: inherited as Resolver } });
    expect(skipped.ok && skipped.controlIntents).toBeUndefined();
    expect(inherited).not.toHaveBeenCalled();
    const factPlan = plan({ expectedState: { facts: [{ fact: "exists", target: { handle: "t9" } }] } });
    const facts = await resolve(undefined, factPlan, { binding: { resolvePlanNodeParameters: ({ nodeDefinitionId }) => nodeDefinitionId === AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID
      ? { status: "resolved", parameters: { selector: "#fact" }, controlIntent: { intent: "accept", responseOnly: true } }
      : { status: "unchanged" } } });
    expect(facts.ok).toBe(true);
    expect(facts.ok && facts.controlIntents).toBeUndefined();
    const refused = await resolve({ status: "refused", issueCodes: ["library.refused"] });
    expect(refused).toEqual({ ok: false, issues: [expect.objectContaining({ code: "library.refused" })] });
  });

  it("keeps accepted values isolated from later replies and from the next resolution", async () => {
    const shared = { intent: "accept", responseOnly: true };
    const written = plan();
    written.subflows[0]!.nodes.push({ key: "second", definitionId: "library.press", definitionVersion: VERSION });
    let call = 0;
    const result = await resolve(undefined, written, { binding: { resolvePlanNodeParameters: (() => {
      if (call++ === 0) return resolved(shared);
      shared.responseOnly = false;
      return { status: "resolved", parameters: {}, controlIntent: { intent: "dismiss" } };
    }) as Resolver } });
    expect(result.ok && [...result.controlIntents!.values()]).toEqual([{ intent: "accept", responseOnly: true }, { intent: "dismiss" }]);
    const next = await resolve({ status: "resolved", parameters: {} });
    expect(next.ok && next.controlIntents).toBeUndefined();
  });
});
