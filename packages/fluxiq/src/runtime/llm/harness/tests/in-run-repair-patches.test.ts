// The two kinds an in-run repair may write (state-aware recovery plan, C6 step
// 8 and C12): a scoped handler for what the run met, and the replacement of
// exactly one unit. They are offered only to a request that lists them, read
// strictly at the boundary, and held to C4's and C5's rules before anything is
// overlaid on a graph.

import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_IN_RUN_REPAIR_PATCH_KINDS, automationStudioRuntimePatchOutputSchema, parseAutomationStudioLlmProviderResult } from "../index.ts";

type SchemaNode = { const?: unknown; required?: string[]; description?: string; properties?: Record<string, SchemaNode>; oneOf?: SchemaNode[]; items?: SchemaNode; enum?: unknown[]; minItems?: number };

const TODAYS_KINDS = ["temporary_action_sequence", "temporary_wait_retry", "temporary_target_override", "temporary_recovery_subflow_call", "temporary_reroute"];

function offeredKinds(allowedKinds?: readonly string[]): unknown[] {
  const schema = automationStudioRuntimePatchOutputSchema({ proposalOnly: false, ...(allowedKinds ? { allowedKinds } : {}) }) as SchemaNode;
  const variants = schema.oneOf?.[0]?.properties?.patches?.items?.oneOf ?? [];
  return variants.map((variant) => variant.properties?.kind?.const);
}

function variant(kind: string): SchemaNode {
  const schema = automationStudioRuntimePatchOutputSchema({ proposalOnly: false, allowedKinds: [kind] }) as SchemaNode;
  return schema.oneOf![0]!.properties!.patches!.items!.oneOf![0]!;
}

const condition = { fact: "dialog.visible", op: "visible" as const };

function addHandler(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "add_handler",
    reason: "A notice covers the list now and then.",
    consequences: [],
    event: "before",
    scope: { kind: "nodes", nodeIds: ["node.read"] },
    when: [condition],
    completionCheck: [{ fact: "dialog.visible", op: "absent" }],
    steps: [{ definitionId: "builtin.data.constant", label: "Close the notice", parameters: { value: "close" } }],
    then: { kind: "resume" },
    ...overrides
  };
}

function parse(patch: Record<string, unknown>) {
  return parseAutomationStudioLlmProviderResult({ response: { kind: "runtime_patch", summary: "Repair the step.", riskLevel: "high", patches: [patch] } }, "runtime_patch");
}

function codes(result: ReturnType<typeof parse>): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("the in-run repair kinds", () => {
  it("are offered only to a request that lists them, so every other caller sees today's five", () => {
    expect(offeredKinds()).toEqual(TODAYS_KINDS);
    expect(offeredKinds(TODAYS_KINDS)).toEqual(TODAYS_KINDS);
    expect(offeredKinds(["temporary_wait_retry", ...AUTOMATION_STUDIO_IN_RUN_REPAIR_PATCH_KINDS])).toEqual(["temporary_wait_retry", "add_handler", "replace_unit"]);
  });

  it("shows a handler with what it must say, and never a scope for the whole automation", () => {
    const shown = variant("add_handler");

    expect(shown.required).toEqual(expect.arrayContaining(["kind", "reason", "consequences", "event", "scope", "when", "steps", "then"]));
    expect(shown.properties?.event?.enum).toEqual(["before", "retry", "fail", "before_next"]);
    expect(shown.properties?.scope?.oneOf?.map((scope) => scope.properties?.kind?.const)).toEqual(["nodes", "subflow"]);
    expect(shown.properties?.then?.oneOf?.map((then) => then.properties?.kind?.const)).toEqual(["resume", "route", "resolve", "give_up"]);
    expect(shown.properties?.completionCheck?.minItems).toBe(1);
  });

  it("shows a unit replacement naming a node, a handler or a part", () => {
    const shown = variant("replace_unit");

    expect(shown.required).toEqual(["kind", "reason", "consequences", "unit"]);
    expect(shown.properties?.unit?.oneOf?.map((unit) => unit.properties?.kind?.const)).toEqual(["node", "handler", "part"]);
    expect(shown.properties).toHaveProperty("failedEdgeTo");
  });

  // Model guidance never teaches to the test: what the model is shown about
  // these kinds speaks of steps, facts and parts, never a kind of site.
  it("describes both kinds in general terms only", () => {
    const text = JSON.stringify([variant("add_handler"), variant("replace_unit")]).toLowerCase();

    for (const word of ["shop", "cart", "product", "job", "auction", "friend", "feed", "listing", "rate limit", "login", "captcha"]) expect(text, word).not.toContain(word);
  });

  it("reads a handler and each unit replacement as written", () => {
    expect(parse(addHandler()).response).toMatchObject({ patches: [{ kind: "add_handler", event: "before", then: { kind: "resume" } }] });
    expect(parse({ kind: "replace_unit", reason: "The step changed.", consequences: [], unit: { kind: "node", nodeId: "node.read" }, steps: [{ definitionId: "builtin.data.constant" }], failedEdgeTo: "node.end" }).diagnostics).toEqual([]);
    expect(parse({ kind: "replace_unit", reason: "The part changed.", consequences: [], unit: { kind: "part", subflowId: "subflow.search" }, steps: [{ definitionId: "builtin.data.constant" }] }).diagnostics).toEqual([]);
    const { kind: _kind, reason: _reason, consequences: _consequences, ...handler } = addHandler({ event: "fail", completionCheck: undefined, then: { kind: "give_up" } });
    expect(parse({ kind: "replace_unit", reason: "The handler missed a case.", consequences: [], unit: { kind: "handler", nodeId: "node.handler" }, handler: JSON.parse(JSON.stringify(handler)) }).diagnostics).toEqual([]);
  });

  it.each([
    ["a scope for the whole automation", addHandler({ scope: { kind: "automation" } }), "llm_output.invalid_add_handler"],
    ["an op the grammar does not have", addHandler({ when: [{ fact: "dialog.visible", op: "looks_like" }] }), "llm_output.invalid_add_handler"],
    ["a condition target that is a locator, not a handle", addHandler({ when: [{ ...condition, target: { selector: "#notice" } }] }), "llm_output.invalid_add_handler"],
    ["an expression where a value goes", addHandler({ when: [{ ...condition, value: { expression: "1 + 1" } }] }), "llm_output.invalid_add_handler"],
    ["more conditions than the bound", addHandler({ when: Array.from({ length: 9 }, () => ({ ...condition })) }), "llm_output.invalid_add_handler"],
    ["more steps than the bound", addHandler({ steps: Array.from({ length: 9 }, () => ({ definitionId: "builtin.data.constant" })) }), "llm_output.invalid_add_handler"],
    ["a then with a field it does not take", addHandler({ then: { kind: "resume", checkpointId: "cp" } }), "llm_output.invalid_add_handler"],
    ["a field a handler does not have", addHandler({ order: 3 }), "llm_output.unexpected_field"],
    ["a handler replaced by steps", { kind: "replace_unit", reason: "r", consequences: [], unit: { kind: "handler", nodeId: "h" }, steps: [{ definitionId: "builtin.data.constant" }] }, "llm_output.invalid_replace_unit"],
    ["a part replacement naming where failure goes", { kind: "replace_unit", reason: "r", consequences: [], unit: { kind: "part", subflowId: "s" }, steps: [{ definitionId: "builtin.data.constant" }], failedEdgeTo: "n" }, "llm_output.invalid_replace_unit"],
    ["a unit of no known kind", { kind: "replace_unit", reason: "r", consequences: [], unit: { kind: "graph", nodeId: "n" }, steps: [{ definitionId: "builtin.data.constant" }] }, "llm_output.invalid_replace_unit"]
  ])("refuses %s at the boundary", (_label, patch, code) => {
    const result = parse(patch);

    expect(result.response).toBeUndefined();
    expect(codes(result)).toContain(code);
  });

  it.each([
    ["a before handler with no completion check", addHandler({ completionCheck: [] }), "llm_output.handler_missing_completion_check"],
    ["a retry handler that names no situation", addHandler({ event: "retry", when: [] }), "llm_output.handler_missing_when"],
    ["resume after a failure", addHandler({ event: "fail", then: { kind: "resume" } }), "llm_output.handler_then_not_allowed"],
    ["resolve before an attempt", addHandler({ then: { kind: "resolve", outputs: { value: "x" } } }), "llm_output.handler_then_not_allowed"]
  ])("refuses %s in output validation", (_label, patch, code) => {
    const result = parse(patch);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ severity: "error", code }));
  });

  it("lets a fail handler resolve with outputs and carry no completion check", () => {
    expect(parse(addHandler({ event: "fail", completionCheck: undefined, then: { kind: "resolve", outputs: { value: "fallback" } } })).diagnostics).toEqual([]);
  });
});
