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

// t653 (live run `run-mva6mlo8-f519063c`): four of 21 judge replies wrote
// `summary` first, looped in it to the provider's output ceiling and left no
// verdict. A verification is asked for its diagnosis before its summary, in
// the schema's order and in words; every other diagnosis keeps its shape.
describe("automationStudioDeepSeekOutputSchema for a result verification", () => {
  const verification = { taskKind: "loop_verification", expectedOutput: "diagnosis", context: {} } as unknown as AutomationStudioLlmTaskRequest;
  const diagnosis = { taskKind: "runtime_diagnosis", expectedOutput: "diagnosis", context: {} } as unknown as AutomationStudioLlmTaskRequest;
  const members = (request: AutomationStudioLlmTaskRequest) => Object.keys((automationStudioDeepSeekOutputSchema(request) as { properties: Record<string, unknown> }).properties);

  it("lists kind and diagnosis before summary, and requires the diagnosis", () => {
    expect(members(verification)).toEqual(["kind", "diagnosis", "confidence", "summary", "metadata"]);
    expect((automationStudioDeepSeekOutputSchema(verification) as { required: string[] }).required).toEqual(["kind", "diagnosis", "summary"]);
    // The same members and the same field shapes: only the order and the
    // requirement moved, and the diagnosis took the verification's defects (t752).
    const { properties: { diagnosis: orderedFields, ...ordered } } = automationStudioDeepSeekOutputSchema(verification) as { properties: Record<string, { properties: Record<string, unknown> }> };
    const { properties: { diagnosis: plainFields, ...plain } } = automationStudioDeepSeekOutputSchema(diagnosis) as { properties: Record<string, { properties: Record<string, unknown> }> };
    expect(ordered).toEqual(plain);
    const { defects: _defects, ...judged } = orderedFields!.properties;
    expect({ ...orderedFields, required: undefined, properties: judged }).toEqual({ ...plainFields, required: undefined });
    expect((orderedFields as { required?: string[] }).required).toEqual(["answersRequest", "defects"]);
  });

  it("is the only diagnosis whose order moved", () => {
    expect(members(diagnosis)).toEqual(["kind", "summary", "confidence", "diagnosis", "metadata"]);
  });

  it("says the order in the verification's words, right after the fields, and nowhere else", () => {
    const ORDER = "Write the reply's members in the order the outputSchema lists them: kind first, then the whole diagnosis object";
    const prompt = automationStudioDeepSeekSystemPrompt(verification);
    expect(prompt).toContain(ORDER);
    expect(prompt.indexOf(ORDER)).toBeGreaterThan(prompt.indexOf("Put your reading of the failure in the diagnosis object"));
    expect(prompt.indexOf(ORDER)).toBeLessThan(prompt.indexOf("This call judges a finished run's result"));
    expect(automationStudioDeepSeekSystemPrompt(diagnosis)).not.toContain(ORDER);
  });
});

// t752 (round-5 breadth rerun): both judges of a trial that stored exactly the
// rows asked for said no over how a condition was written, naming no row kept,
// missing or wrong. A verification's no now names each defect it rests on, in a
// field only a verification is offered.
describe("a verification's defects (t752)", () => {
  const verification = { taskKind: "loop_verification", expectedOutput: "diagnosis", context: {} } as unknown as AutomationStudioLlmTaskRequest;
  const fieldsOf = (request: AutomationStudioLlmTaskRequest) => (automationStudioDeepSeekOutputSchema(request) as { properties: { diagnosis: { properties: Record<string, unknown> } } }).properties.diagnosis.properties;

  it("offers at most 12 closed defects, each a kind, the row, an optional column and the request's words, right after the verdict", () => {
    expect(Object.keys(fieldsOf(verification))).toEqual(["expected", "observed", "changed", "stillAchievable", "deterministicRecoveryPossible", "answersRequest", "defects", "explorationNeeded", "patchNeeded"]);
    expect(fieldsOf(verification).defects).toEqual({
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "row", "requestWords"],
        properties: {
          kind: { enum: ["kept_not_asked", "asked_missing", "wrong_value", "other"] },
          row: { type: "string", minLength: 1, maxLength: 500 },
          column: { type: "string", minLength: 1, maxLength: 500 },
            value: { type: "string", minLength: 1, maxLength: 500 },
          requestWords: { type: "string", minLength: 1, maxLength: 500 }
        }
      }
    });
  });

  it("is offered to no other diagnosis", () => {
    for (const taskKind of ["runtime_diagnosis", "diagnosis_only_report", "loop_plan"]) {
      const request = { taskKind, expectedOutput: "diagnosis", context: {} } as unknown as AutomationStudioLlmTaskRequest;
      expect(JSON.stringify(automationStudioDeepSeekOutputSchema(request)), taskKind).not.toContain("defects");
    }
  });
});

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
