// The one channel a model may answer a diagnosis through.
//
// Core strips every structured response's `metadata`, deliberately: an open
// field is a way past the recognized-field allowlist. That left no channel at
// all, so the structured diagnosis the runtime builds was entirely Core's own
// verdicts and the model's contribution was a sentence of prose nothing acts
// on. `diagnosis` is the narrow replacement -- named keys, each one Core can
// check without knowing what medium the failure happened in.
//
// These tests hold both halves: the field arrives, and nothing arrives beside
// it.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek-provider.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmDiagnosisFields } from "../harness.ts";

const base = { taskKind: "runtime_diagnosis" as const, projectId: "project.llm", flowId: "flow.checkout", instructions: [] as AutomationStudioFlowInstruction[] };

async function diagnose(response: Record<string, unknown>) {
  return runAutomationStudioLlmHarness({
    ...base,
    provider: { metadata: { provider: "mock", model: "diagnosis" }, runTask: async () => ({ response: response as never }) }
  });
}

const fields: AutomationStudioLlmDiagnosisFields = {
  expected: "The confirmation should follow the submission.",
  observed: "Nothing followed it.",
  changed: "The control the step addressed is no longer offered.",
  stillAchievable: "yes",
  deterministicRecoveryPossible: "no",
  explorationNeeded: true,
  patchNeeded: true
};

describe("Automation Studio LLM structured diagnosis channel", () => {
  it("carries the named diagnosis fields through and still strips metadata", async () => {
    const result = await diagnose({ kind: "diagnosis", summary: "The target is gone.", confidence: 0.8, diagnosis: fields, metadata: { smuggled: "arbitrary JSON" } });
    expect(result.ok).toBe(true);
    expect(result.response).toEqual({ kind: "diagnosis", summary: "The target is gone.", confidence: 0.8, diagnosis: fields });
    // The strip stays a named-field allowlist. `diagnosis` is carried because
    // every key inside it was checked by name; `metadata` is not, because it
    // was not, and could not be.
    expect(result.response).not.toHaveProperty("metadata");
    expect(JSON.stringify(result)).not.toContain("smuggled");
  });

  it("refuses a field Core cannot check, so the channel does not become an opening", async () => {
    const unknownKey = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: { ...fields, rootCause: { sql: "DROP TABLE runs" } } });
    expect(unknownKey.ok).toBe(false);
    expect(unknownKey.response).toBeUndefined();
    expect(unknownKey.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.unexpected_field");

    const overlong = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: { observed: "x".repeat(501) } });
    expect(overlong.ok).toBe(false);
    expect(overlong.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_diagnosis_text");

    const badVerdict = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: { stillAchievable: "probably" } });
    expect(badVerdict.ok).toBe(false);
    expect(badVerdict.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_diagnosis_verdict");

    const badFlag = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: { patchNeeded: "yes" } });
    expect(badFlag.ok).toBe(false);
    expect(badFlag.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_diagnosis_flag");

    const notAnObject = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: "the target moved" });
    expect(notAnObject.ok).toBe(false);
    expect(notAnObject.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_diagnosis_fields");

    // A diagnosis that supplies nothing is still a valid diagnosis: the channel
    // is optional, and a model with no answer for a field omits it.
    const bare = await diagnose({ kind: "diagnosis", summary: "A diagnosis." });
    expect(bare.ok).toBe(true);
    expect(bare.response).toEqual({ kind: "diagnosis", summary: "A diagnosis." });
  });

  it("asks a provider for the fields, in the schema and in the prompt", async () => {
    let outbound = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => { outbound = input.outboundBody; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "The target is gone.", diagnosis: fields }) } }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
      }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })) as typeof fetch
    });
    const prepared = await diagnose({ kind: "diagnosis", summary: "unused" });
    const answered = await provider.runTask(prepared.request) as { response: unknown };
    const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
    const system = body.messages.find((message) => message.role === "system")!.content;
    const user = JSON.parse(body.messages.find((message) => message.role === "user")!.content) as { outputSchema: { properties: Record<string, { additionalProperties?: boolean; properties?: Record<string, unknown> }> } };

    // Permitting the object is half of opening the channel; asking for it is the
    // other half. Without the instruction a model puts everything in `summary`,
    // which is the state this replaces.
    expect(system).toContain("Put your reading of the failure in the diagnosis object");
    expect(user.outputSchema.properties.diagnosis?.additionalProperties).toBe(false);
    expect(Object.keys(user.outputSchema.properties.diagnosis?.properties ?? {})).toEqual([
      "expected", "observed", "changed", "stillAchievable", "deterministicRecoveryPossible", "answersRequest", "explorationNeeded", "patchNeeded"
    ]);
    // And the provider's own parse returns what the model put there.
    expect(answered.response).toEqual({ kind: "diagnosis", summary: "The target is gone.", diagnosis: fields });
  });
});
