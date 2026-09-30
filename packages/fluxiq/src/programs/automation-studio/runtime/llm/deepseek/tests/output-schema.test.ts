// The patch shapes a model is shown, narrowed to what the recovery plan allows.
//
// It was shown all five kinds whatever the plan allowed, and live runs wrote a
// kind the plan refused -- a target override for an `output_not_observed`
// failure whose plan allows a reroute, a subflow call or an action sequence
// only -- so the patch call was spent on a patch that could not land (t193 wK,
// C3). The mutation this is written against: dropping the request's
// `allowedPatchKinds` on the way to the schema.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { automationStudioDeepSeekOutputSchema } from "../output-schema.ts";
import { automationStudioDeepSeekSystemPrompt } from "../system-prompt.ts";

describe("automationStudioDeepSeekOutputSchema for a runtime patch", () => {
  it("offers exactly the plan's allowed kinds", () => {
    expect(patchKindsOffered(patchRequest(["temporary_target_override", "temporary_wait_retry"]))).toEqual(["temporary_wait_retry", "temporary_target_override"]);
    expect(patchKindsOffered(patchRequest(["temporary_reroute", "temporary_recovery_subflow_call", "temporary_action_sequence"]))).toEqual(["temporary_action_sequence", "temporary_recovery_subflow_call", "temporary_reroute"]);
  });

  it("offers every kind when the request declares none", () => {
    expect(patchKindsOffered(patchRequest(undefined))).toHaveLength(5);
  });

  it("offers only the no-repair answer when the declared kinds leave none", () => {
    const schema = automationStudioDeepSeekOutputSchema(patchRequest([])) as { oneOf: Array<{ properties: { kind: { const: string } } }> };

    expect(schema.oneOf.map((shape) => shape.properties.kind.const)).toEqual(["no_repair"]);
  });

  it("keeps a proposal-only run to its one target override", () => {
    const request = patchRequest(["temporary_target_override", "temporary_wait_retry"], "diagnose_and_adapt");
    const schema = automationStudioDeepSeekOutputSchema(request) as { oneOf: Array<{ properties: { patches?: { items: { properties: { kind: { const: string } } } } } }> };

    expect(schema.oneOf[0]?.properties.patches?.items.properties.kind.const).toBe("temporary_target_override");
  });

  it("never names a refused kind anywhere the model reads the schema", () => {
    const request = patchRequest(["temporary_reroute"]);

    expect(JSON.stringify(automationStudioDeepSeekOutputSchema(request))).not.toContain("temporary_target_override");
    expect(automationStudioDeepSeekSystemPrompt(request)).not.toContain("temporary_target_override");
  });
});

function patchRequest(allowedPatchKinds: string[] | undefined, executionPurpose?: string): AutomationStudioLlmTaskRequest {
  return {
    taskKind: "runtime_patch",
    expectedOutput: "runtime_patch",
    context: {},
    metadata: { source: "test", expectedOutput: "runtime_patch", ...(allowedPatchKinds ? { allowedPatchKinds } : {}), ...(executionPurpose ? { executionPurpose } : {}) }
  } as unknown as AutomationStudioLlmTaskRequest;
}

function patchKindsOffered(request: AutomationStudioLlmTaskRequest): string[] {
  const schema = automationStudioDeepSeekOutputSchema(request) as { oneOf: Array<{ properties: { patches?: { items: { oneOf: Array<{ properties: { kind: { const: string } } }> } } } }> };
  return schema.oneOf[0]?.properties.patches?.items.oneOf.map((variant) => variant.properties.kind.const) ?? [];
}
