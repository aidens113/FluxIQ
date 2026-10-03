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
import { createAutomationStudioDeepSeekProvider } from "../deepseek/index.ts";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmDiagnosisFields } from "../harness.ts";
import { AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION, automationStudioDiagnosisPromptInstruction } from "../diagnosis-instructions.ts";

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

    // A text past its bound is read clipped to it, never carried whole and never
    // voiding the reply (live run murwcmx2, `harness/tests/long-diagnosis-text.test.ts`);
    // a text that is not a string is still refused.
    const overlong = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: { observed: "x".repeat(501) } });
    expect(overlong.ok).toBe(true);
    expect(overlong.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.diagnosis_text_clipped");
    const clipped = overlong.response?.kind === "diagnosis" ? (overlong.response.diagnosis?.observed ?? "") : "";
    expect(clipped.length).toBeLessThanOrEqual(500);
    expect(clipped.endsWith("[clipped]")).toBe(true);

    const notText = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: { observed: { sql: "DROP TABLE runs" } } });
    expect(notText.ok).toBe(false);
    expect(notText.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.invalid_diagnosis_text");

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

// Live run 16 (`run-muqk713g-d08ad3dc`): shown the rows a condition removed by
// itself under a bare `removedByItself`, the judge read three earbuds the
// accessory rule had left out as rows that came back, and advised tightening the
// rule. The field now says what it is, and the judge's instruction says it once.
describe("the judge is told what the rows a condition left out by itself are", () => {
  it("names the field and says none of its rows came back", () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("leftOutOnlyByThis names the rows that condition alone left out of the result");
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("none of them came back");
  });
});

// Live run `run-muqk713g` (C3, C5): the build-test judge saw a replayed read as
// counts only, and both judges read an item "with Wireless Charging Case" as the
// accessory the request left out. The build-test judge is now told what a
// replayed read's rows are, and both what a row the request excludes is.
describe("the judges are told what an excluded row is, and what a replayed read's rows are", () => {
  it("says an excluded row is the excluded kind of thing, not one whose text only mentions it", () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain(
      "A row the request excludes is one that is the excluded kind of thing, not one whose text only mentions it: an item sold with or including an excluded part is still the item."
    );
  });

  it("tells the build-test judge what readRows holds, and to read its leftOutOnlyByThis as a read's", () => {
    const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true });
    expect(prompt).toContain("readRows");
    expect(prompt).toContain("readRows.leftOutOnlyByThis");
  });

  // t195-w34, live run `run-murwcaj0-40e56557` (R6): shown only the names a mutual-friends
  // regex left out, the judge took the regex's intent for what it did.
  it("tells both judges a left-out row is written with the value its condition tested, and to judge from it", () => {
    const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true });
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("where the value that condition tested on that row is known, written label — column: value");
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("Read each row's tested value against the request yourself rather than trusting what the condition was meant to do");
    expect(prompt).toContain("each written label — column: value where the test knows the value that condition tested on it");
  });
});

// t195-w39, live run `run-murwcaj0-40e56557` (J1): shown a repeated Confirm's
// target with the card it was built on, the build-test judge called the loop's
// press "one remembered target repeated, not a per-row confirm". At playback a
// repeated step acts on each row's own control; the judge is now told so.
describe("the build-test judge is told a repeated step acts on each row of its listing", () => {
  it("says a repeated step acts on each row, never only on the row it was built on", () => {
    const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true });
    expect(prompt).toContain("A repeated step acts on each row that step keeps, finding its control again inside each row, never only on the row it was built on");
  });
});

// Run `run-murwd8le-79e735a8` (Cause 9): the post-run checks 0071 and 0072
// called the playback "a build test", because their system prompt carried the
// "When resultSummary.buildTest is present ..." paragraph with no buildTest.
describe("the post-run check is told it judges a finished run, and only a build's test is told it judges one", () => {
  it("sends the build-test paragraph only with a buildTest", () => {
    const finished = automationStudioDiagnosisPromptInstruction("loop_verification");
    expect(finished).not.toContain("resultSummary.buildTest");
    expect(finished).not.toMatch(/build's test/u);
    expect(automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true })).toContain("When resultSummary.buildTest is present");
  });

  // Cause 7: neither judge was shown the page the run or test ended on.
  it("tells every judge what the page the run or test ended on is, and how to read it", () => {
    for (const prompt of [automationStudioDiagnosisPromptInstruction("loop_verification"), automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true })]) {
      expect(prompt).toContain("resultSummary.endView");
    }
  });
});

// t252 D4, D6: a repeated step now runs once per row in the build's test, and
// the Flow's inputs are tested at their test values. Only a build's test is told.
describe("the build-test judge is told what a repeated step's passes and the Flow's inputs are", () => {
  it("says a repeated step runs once per row and each pass is judged against its own row", () => {
    const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true });
    expect(prompt).toContain("A repeated step runs once for each row of the list it repeats over");
    expect(prompt).toContain("Judge each pass against its own row, not the row the build explored");
    expect(prompt).toContain("buildTest.inputs");
    expect(automationStudioDiagnosisPromptInstruction("loop_verification")).not.toContain("passes");
  });
});

// t193 1002-M (live run `run-murzln6g-11debe1d`, C6): the drawer's "×" the Flow
// passes over failed in the test, the judge was shown it as plain `failed`,
// and its second answer asked to "fix or remove the failed step 15".
describe("the judge's instruction on an excused step", () => {
  it("says an excused step is no defect: never a no for it alone, and never fix or remove it in changed", () => {
    // Only a build's test has excused steps, so it is said where buildTest is.
    const instruction = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true });
    expect(instruction).toMatch(/excused/u);
    expect(instruction).toMatch(/excused[^.]*not a defect/u);
    expect(instruction).toMatch(/never asks? to fix, rerun or remove it/u);
  });
});
