import { describe, expect, it } from "vitest";
import { automationStudioRefreshPatches } from "../patches.ts";
import { automationStudioApplyParameterRefresh } from "../apply.ts";
import { automationStudioRefreshInputs } from "../inputs.ts";
import { context, refresh } from "../../unbound-reacquire/tests/fixtures.ts";
import type { AutomationStudioParameterRefreshOverlay } from "../overlay.ts";

describe("trusted target patches and arrival isolation", () => {
  it("atomically sets/removes only declared optional fields without touching a wrapper", () => {
    const original = { outputId: "example.activate", requiresApproval: true, parameters: { selector: "old", element: { identity: "specimen-17" }, note: "same" } };
    const result = automationStudioRefreshPatches({ ...refresh, container: "output" }, original, [{ operation: "remove", parameterId: "selector" }, { operation: "set", parameterId: "element", value: { identity: "specimen-17", address: "fresh" } }]);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") throw new Error("Expected valid target patches.");
    expect(result.parameters).toEqual({ outputId: "example.activate", requiresApproval: true, parameters: { element: { identity: "specimen-17", address: "fresh" }, note: "same" } });
    expect(original.parameters.selector).toBe("old");
  });

  it.each([
    [{ operation: "remove", parameterId: "element" }],
    [{ operation: "set", parameterId: "outputId", value: "other" }],
    [{ operation: "set", parameterId: "parameters.selector", value: "fresh" }],
    [{ operation: "set", parameterId: "selector", value: "fresh" }, { operation: "set", parameterId: "selector", value: "another" }],
    [{ operation: "set", parameterId: "selector", value: undefined }],
    [{ operation: "remove", parameterId: "selector", value: null }],
    [{ operation: "set", parameterId: "selector", value: "fresh", requiresApproval: false }],
    [{ operation: "set", parameterId: "__proto__", value: {} }]
  ].map((patches) => ({ patches })))("rejects the whole malformed or unauthorized patch %j", ({ patches }) => {
    const original = { selector: "old", element: { identity: "specimen-17" } };
    expect(automationStudioRefreshPatches(refresh, original, patches).kind).toBe("rejected");
    expect(original.selector).toBe("old");
  });

  it("invalidates a target binding change and retains current unrelated parameters", () => {
    const { node } = context();
    const overlay: AutomationStudioParameterRefreshOverlay = { nodeId: node.id, definitionId: node.definitionId, refresh, baseline: { selector: "old", element: { identity: "specimen-17" }, note: "old note" }, patches: [{ operation: "set", parameterId: "selector", value: "fresh" }], active: true };
    const applied = automationStudioApplyParameterRefresh(node, { ...overlay.baseline, note: "new note" }, overlay);
    expect(applied).toMatchObject({ kind: "applied", parameters: { selector: "fresh", note: "new note" } });
    expect(automationStudioApplyParameterRefresh(node, { ...overlay.baseline, selector: "deliberately changed" }, overlay)).toEqual({ kind: "rejected", reason: "binding_changed" });
    expect(overlay.active).toBe(false);
  });

  it("uses dispatch's precedence, live variables and fallback without resolving a state value again", () => {
    const { ctx, node } = context({ inputs: { key: "input" } });
    node.parameterValues = { selector: { $state: { path: "key" } }, element: { $state: { path: "identity" } }, note: { $state: { path: "absent", fallback: "fallback" } } };
    ctx.runState.variables.set("key", "variable");
    ctx.runState.variables.set("identity", { $state: { path: "data, not another binding" } });
    const first = automationStudioRefreshInputs(ctx.flow, node, ctx.values, ctx.options, ctx.runState.variables);
    expect(first.values).toEqual({ selector: "variable", element: { $state: { path: "data, not another binding" } }, note: "fallback" });
    ctx.values.key = "run value";
    expect(automationStudioRefreshInputs(ctx.flow, node, ctx.values, ctx.options, ctx.runState.variables).values.selector).toBe("run value");
  });
});
