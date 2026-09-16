import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import type { AutomationStudioRuntimeDeterministicDiagnosis } from "../deterministic-diagnosis.ts";
import {
  AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_TEXT_MAX_LENGTH,
  buildAutomationStudioRuntimeStructuredDiagnosis,
  summarizeAutomationStudioRuntimeStructuredDiagnosis
} from "../structured-diagnosis.ts";

// The diagnosis stopped being a sentence. These pin the three things that makes
// possible: a default that does not need a model at all, a model answer that
// may narrow it, and a refusal where a model answer would talk Core past a
// control.
describe("buildAutomationStudioRuntimeStructuredDiagnosis", () => {
  it("is the deterministic answer when no diagnosis call was made", () => {
    const diagnosis = buildAutomationStudioRuntimeStructuredDiagnosis({ deterministic: deterministic() });

    expect(diagnosis).toMatchObject({
      source: "deterministic",
      candidateKind: "action_target_override",
      patchNeeded: true,
      explorationNeeded: false,
      stillAchievable: "unknown",
      deterministicRecoveryPossible: "unknown",
      modelFields: [],
      refusals: []
    });
  });

  // This is L5's second clause without a model in it: a failure whose answer is
  // a report is not a failure a runtime patch addresses, and the patch call used
  // to fire for it anyway.
  it.each(["diagnosis_only" as const, "instruction_suggestion" as const])("asks for no patch when the candidate kind is %s", (candidateKind) => {
    const diagnosis = buildAutomationStudioRuntimeStructuredDiagnosis({ deterministic: deterministic({ candidateKind }) });

    expect(diagnosis.patchNeeded).toBe(false);
  });

  it("takes the model's structured fields when it supplies them, and says which it took", () => {
    const diagnosis = buildAutomationStudioRuntimeStructuredDiagnosis({
      deterministic: deterministic(),
      result: diagnosisResult({
        expected: "The confirmation control is present.",
        observed: "A consent banner is over the page.",
        changed: "A banner appeared that the recording never saw.",
        stillAchievable: "yes",
        deterministicRecoveryPossible: "no",
        explorationNeeded: true,
        patchNeeded: false
      })
    });

    expect(diagnosis).toMatchObject({
      source: "model",
      expected: "The confirmation control is present.",
      observed: "A consent banner is over the page.",
      changed: "A banner appeared that the recording never saw.",
      stillAchievable: "yes",
      deterministicRecoveryPossible: "no",
      explorationNeeded: true,
      patchNeeded: false,
      refusals: []
    });
    expect(diagnosis.modelFields).toEqual(["expected", "observed", "changed", "stillAchievable", "deterministicRecoveryPossible", "explorationNeeded", "patchNeeded"]);
  });

  // Core's "no" here means a person must sign in or act. A model that says
  // otherwise is not better informed; it is being asked to route around a gate.
  it("refuses a model claim that a failure Core says needs a person is still achievable", () => {
    const diagnosis = buildAutomationStudioRuntimeStructuredDiagnosis({
      deterministic: deterministic({ failureClass: "auth_required", stillAchievable: "no" }),
      result: diagnosisResult({ stillAchievable: "yes" })
    });

    expect(diagnosis.stillAchievable).toBe("no");
    expect(diagnosis.modelFields).not.toContain("stillAchievable");
    expect(diagnosis.refusals).toEqual([expect.stringContaining("so Core's \"no\" stands")]);
  });

  it("refuses a field of the wrong shape, an over-long description, and records both", () => {
    const diagnosis = buildAutomationStudioRuntimeStructuredDiagnosis({
      deterministic: deterministic(),
      result: diagnosisResult({
        expected: "x".repeat(AUTOMATION_STUDIO_STRUCTURED_DIAGNOSIS_TEXT_MAX_LENGTH + 1),
        explorationNeeded: "probably" as unknown as boolean,
        stillAchievable: "maybe"
      })
    });

    expect(diagnosis.expected).toBeUndefined();
    expect(diagnosis.explorationNeeded).toBe(false);
    expect(diagnosis.stillAchievable).toBe("unknown");
    expect(diagnosis.refusals).toEqual([
      expect.stringContaining("expected: 501 characters"),
      expect.stringContaining("stillAchievable: expected yes, no or unknown"),
      expect.stringContaining("explorationNeeded: expected a boolean")
    ]);
  });

  it("ignores a diagnosis response the call did not actually succeed with", () => {
    const failed = buildAutomationStudioRuntimeStructuredDiagnosis({
      deterministic: deterministic(),
      result: { ...diagnosisResult({ patchNeeded: false }), ok: false }
    });

    expect(failed).toMatchObject({ source: "deterministic", patchNeeded: true });
  });

  it("clamps a confidence outside zero to one rather than carrying it", () => {
    const high = buildAutomationStudioRuntimeStructuredDiagnosis({ deterministic: deterministic(), result: diagnosisResult({}, 4.2) });

    expect(high.confidence).toBe(1);
  });
});

// The record written onto a run carries verdicts, not the model's reading of a
// page Core deliberately does not store.
describe("summarizeAutomationStudioRuntimeStructuredDiagnosis", () => {
  it("counts the descriptions and carries none of them", () => {
    const summary = summarizeAutomationStudioRuntimeStructuredDiagnosis(buildAutomationStudioRuntimeStructuredDiagnosis({
      deterministic: deterministic(),
      result: diagnosisResult({ expected: "The confirmation control is present.", observed: "PRIVATE_PAGE_TEXT", patchNeeded: true })
    }));

    expect(JSON.stringify(summary)).not.toContain("PRIVATE_PAGE_TEXT");
    expect(JSON.stringify(summary)).not.toContain("confirmation control");
    expect(summary).toMatchObject({ describedFieldCount: 2, patchNeeded: true, source: "model" });
  });
});

function deterministic(overrides: Partial<AutomationStudioRuntimeDeterministicDiagnosis> = {}): AutomationStudioRuntimeDeterministicDiagnosis {
  return {
    schemaVersion: "automation-studio.deterministic-diagnosis.v1",
    failureClass: "target_not_found",
    candidateKind: "action_target_override",
    signature: "signature.one",
    resolution: "model_required",
    modelNeeded: true,
    reason: "Failure is unresolved after deterministic recovery lookup.",
    requiredPriorAction: "none",
    stillAchievable: "unknown",
    deterministicRecoveryAvailable: false,
    rerouteAvailable: false,
    knownAdaptationAvailable: false,
    knownAdaptationIds: [],
    ...overrides
  };
}

/** Only `ok` and `response` are read; the rest of the result is not consulted. */
function diagnosisResult(metadata: JsonObject, confidence?: number): AutomationStudioLlmTaskResult {
  return {
    ok: true,
    diagnostics: [],
    response: { kind: "diagnosis", summary: "The action could not find its control.", ...(confidence === undefined ? {} : { confidence }), metadata }
  } as unknown as AutomationStudioLlmTaskResult;
}
