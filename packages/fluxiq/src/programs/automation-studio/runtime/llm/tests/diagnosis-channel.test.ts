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
import type { AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
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

describe("complete quantity and cohort guidance in the actual verification request", () => {
  it.each([false, true])("delivers the same cohort comparison to the provider (buildTest=%s) without changing its answer schema", async (buildTest) => {
    const instruction: AutomationStudioFlowInstruction = {
      schemaVersion: "0.1", instructionId: "instruction.cohort", title: "Required cohort", body: "Return every subject meeting the stated requirements.",
      scope: { kind: "flow", projectId: base.projectId, flowId: base.flowId }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
    };
    const resultSummary: AutomationStudioRunResultSummary = {
      schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0,
      recordSetCount: 0, recordSets: [], flowShape: [], withheld: false,
      ...(buildTest ? { buildTest: { kind: "build_test" as const, test: "ran" as const, steps: [] } } : {})
    };
    const prepared = await runAutomationStudioLlmHarness({ ...base, taskKind: "loop_verification", instructions: [instruction], resultSummary, deniedEvidenceKeys: [] });
    let outbound = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:mock-verification" },
      resolveSecret: async (input) => {
        outbound = input.outboundBody;
        return "test-secret";
      },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "The evidence is inconclusive.", diagnosis: { answersRequest: "unknown" } }) } }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });
    const answered = await provider.runTask(prepared.request) as { response: { diagnosis: AutomationStudioLlmDiagnosisFields } };
    const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
    const system = body.messages.find((message) => message.role === "system")!.content;
    const user = JSON.parse(body.messages.find((message) => message.role === "user")!.content);
    expect(system).toContain("including explicitly identified members and additional components");
    expect(system).toContain("every relevant left-out witness against the original request independently of the authored filter or pattern");
    expect(system).toContain("Count distinct required subjects, not the sum of before-and-after reads");
    expect(system).toContain("answer unknown instead of accepting the authored condition");
    expect(system.includes("When resultSummary.buildTest is present")).toBe(buildTest);
    expect(user.context.instructions.instructions[0].body).toBe(instruction.body);
    expect(user.context.resultSummary.totalRecordCount).toBe(0);
    expect(user.outputSchema.properties.diagnosis.additionalProperties).toBe(false);
    // A verification's diagnosis also names each defect its no rests on (t752); no other diagnosis is offered it.
    expect(Object.keys(user.outputSchema.properties.diagnosis.properties)).toEqual([
      "expected", "observed", "changed", "stillAchievable", "deterministicRecoveryPossible", "answersRequest", "defects", "explorationNeeded", "patchNeeded"
    ]);
    expect(answered.response.diagnosis.answersRequest).toBe("unknown");
  });
});

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

    // A text past its bound is read whole with a warning, never cut and never
    // voiding the reply (live run murwcmx2, t665, `harness/tests/long-diagnosis-text.test.ts`);
    // a text that is not a string is still refused.
    const overlong = await diagnose({ kind: "diagnosis", summary: "A diagnosis.", diagnosis: { observed: "x".repeat(501) } });
    expect(overlong.ok).toBe(true);
    expect(overlong.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.diagnosis_text_past_bound");
    const whole = overlong.response?.kind === "diagnosis" ? (overlong.response.diagnosis?.observed ?? "") : "";
    expect(whole).toBe("x".repeat(501));

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

// t752 (round-5 breadth rerun): a no Core read out of prose rested on how a
// condition was written and on a claim the request refuted, naming no row. The
// no's grounds are a checked list: each defect a kind Core knows, the row, an
// optional column and the request's words, each a bounded string. A malformed
// defect is dropped with a warning, never the reply. A library catalogue, not a
// scenario the Lab measures.
describe("a verification's defects through the diagnosis channel (t752)", () => {
  const kept = { kind: "kept_not_asked", row: "[row K4R7M2] The Long Road", requestWords: "published since 2000" } as const;
  const wrong = { kind: "wrong_value", row: "Field Notes", column: "year", requestWords: "the year each was published" } as const;
  const missing = { kind: "asked_missing", row: "rows not read", requestWords: "every book on the shelf" } as const;
  const answer = (defects: unknown) => diagnose({ kind: "diagnosis", summary: "Not what was asked.", diagnosis: { answersRequest: "no", defects } });
  const dropped = (result: Awaited<ReturnType<typeof diagnose>>) => result.diagnostics.filter((diagnostic) => diagnostic.code === "llm_output.diagnosis_defect_dropped");

  it("carries each well-formed defect, as written", async () => {
    const result = await answer([kept, wrong, missing]);
    expect(result.ok).toBe(true);
    expect(result.response).toEqual({ kind: "diagnosis", summary: "Not what was asked.", diagnosis: { answersRequest: "no", defects: [kept, wrong, missing] } });
    expect(dropped(result)).toEqual([]);
  });

  it("drops a malformed defect with a warning naming its place, and keeps the reply and every other defect", async () => {
    const malformed = [
      { ...kept, kind: "too_strict" },
      { ...kept, row: "   " },
      { ...kept, row: 7 },
      { kind: "kept_not_asked", row: "The Long Road" },
      { ...wrong, column: "" },
      { ...kept, requestWords: "x".repeat(501) },
      { ...kept, because: "a list of values" },
      "The Long Road"
    ];
    const result = await answer([kept, ...malformed, wrong]);
    expect(result.ok).toBe(true);
    expect(result.response).toMatchObject({ diagnosis: { answersRequest: "no", defects: [kept, wrong] } });
    expect(dropped(result).map((diagnostic) => [diagnostic.severity, diagnostic.path])).toEqual(malformed.map((_, index) => ["warning", `response.diagnosis.defects[${index + 1}]`]));
    // The warning never carries what the model wrote.
    expect(JSON.stringify(result.diagnostics)).not.toContain("too_strict");
    expect(JSON.stringify(result.diagnostics)).not.toContain("a list of values");
  });

  it("drops defects that are not a list, or are all malformed, and keeps the verdict", async () => {
    for (const defects of ["The Long Road was kept", { 0: kept }, [{ kind: "wrong_value" }]]) {
      const result = await answer(defects);
      expect(result.ok).toBe(true);
      expect(result.response).toEqual({ kind: "diagnosis", summary: "Not what was asked.", diagnosis: { answersRequest: "no", defects: [] } });
      expect(dropped(result)).toHaveLength(1);
    }
  });

  it("keeps the first 12 and drops the rest with a warning", async () => {
    const many = Array.from({ length: 14 }, (_, index) => ({ ...kept, row: `Book ${index + 1}` }));
    const result = await answer(many);
    expect(result.response).toMatchObject({ diagnosis: { defects: many.slice(0, 12) } });
    expect(dropped(result).map((diagnostic) => diagnostic.path)).toEqual(["response.diagnosis.defects[12]", "response.diagnosis.defects[13]"]);
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

  it("holds rows several conditions left out together to the request's words, and leaves computed facts to Core", () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("each read's leftOutTogether");
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("resultSummary.computedFacts are facts Core measured");
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("do not decide them again or answer no over them");
  });

  it("says what a not_run proof, or notRun on a shown part, means (t796)", () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("not_run means the step doing what the part asks did not run on the passes its notRun lists");
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("whatever the page looks like; a shown part carrying notRun has the same gap on the passes listed, and either is no yes");
  });
});

// t471, lane D round 9 (`run-mv5q4j2n-25784472`): a trial ran on a site that
// still held acts the build could not undo, and the judge was told nothing.
describe("the judge is told what the build had already done when the run began", () => {
  it("reads resultSummary.startedWith as already done, neither the run's doing nor its failure", () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("resultSummary.startedWith, where present, lists what the build itself had already done on the site");
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain("neither this run's doing nor its failure");
    for (const buildTest of [false, true]) expect(automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest })).toContain("resultSummary.startedWith");
  });
});

// t378, lane D (`run-mv0fuual-f9e6f089`): a Flow confirmed all eight friend
// requests where four were asked, and both judges advised a condition on the
// for-each and the press, which sent the model to a filter node a script cannot
// wire. The rows a repeat visits are the rows its listing kept.
describe("the judges send too many rows acted on to the listing's where", () => {
  it("says the fix is the listing's where, not a condition on the repeat or the press, in both judges' prompts", () => {
    const sentence = "A Flow that acts on more rows of a listing than the request asks -- a press repeated over every row where only some qualify -- is fixed with a where condition on the listing step the repeat goes over, which decides the rows each pass visits, not with a condition on the repeat or the press: name that listing step in changed.";
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain(sentence);
    for (const buildTest of [false, true]) expect(automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest })).toContain(sentence);
  });
});

// Live run `run-muqk713g` (C3, C5): the build-test judge saw a replayed read as
// counts only, and both judges read an item "with Wireless Charging Case" as the
// accessory the request left out. The build-test judge is now told what a
// replayed read's rows are, and both what a row the request excludes is.
describe("the judges are told what an excluded row is, and what a replayed read's rows are", () => {
  it("says an excluded row is the excluded kind of thing, not one whose text only mentions it", () => {
    expect(AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION).toContain(
      "A row the request excludes is one that is the excluded kind of thing, not one whose text only mentions it: a report filed with or including an excluded appendix is still the report."
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

  // t443 (run `run-mv4dgmki-2b13db91`, R4b): a withheld act's earlier landing, credited only when it ran after the steps before it.
  it("tells a build's judge how to read a withheld step's earlier landing, and the post-run check nothing of it", () => {
    const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true });
    expect(prompt).toContain("explored.landed, where present, is that act as the build did it earlier: with counts true it ran once after the steps before it");
    expect(prompt).toContain("never ask for it to be run again; with counts false it did not run that way (why says how), and it shows nothing about the Flow.");
    expect(automationStudioDiagnosisPromptInstruction("loop_verification")).not.toContain("explored.landed");
  });

  // Cause 7: neither judge was shown the page the run or test ended on.
  it("tells every judge what the page the run or test ended on is, and how to read it", () => {
    for (const prompt of [automationStudioDiagnosisPromptInstruction("loop_verification"), automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true })]) {
      expect(prompt).toContain("resultSummary.endView");
    }
  });

  // Run `run-muw5zv4m-52d83027`: both judges read a playback's "+" press as a
  // quantity of 1 from status rows and a stale end, never shown what each step changed.
  it("tells the post-run check what each step's own change is, and to read it before the end view", () => {
    const finished = automationStudioDiagnosisPromptInstruction("loop_verification");
    expect(finished).toContain("resultSummary.flowShape[].changed, where present, is what this run saw that step change on the page it stayed on");
    expect(finished).toContain("read each act's own change before endView, which shows only the end");
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
    // A finished run is told what a page loop's passes mean (read-list S3), but never the per-row repeat words: those are the build test's alone.
    const finished = automationStudioDiagnosisPromptInstruction("loop_verification");
    expect(finished).not.toContain("A repeated step runs once for each row of the list it repeats over");
    expect(finished).not.toContain("Judge each pass against its own row");
  });
});

// t174-w106 (live run `run-musp8nz1-dbd3905a`, Causes 2 and 3): the judge cited
// exploration's "3 Cart" as the Flow's result, and was shown a press that
// un-chose Space Grey as plain `replayed`. t193 1003 w3 (`run-musp4h2f-72e8ed99`):
// the judge never saw the quantity a replayed "+" set. Only a build's test is told.
describe("the build-test judge is told the page kept what exploration did, and what a replayed step changed", () => {
  it("says a count or a collected state may predate the test, and how to read observed.changed", () => {
    const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true });
    expect(prompt).toContain("The test started from a page that kept what the build did while it explored");
    expect(prompt).toContain("is exploration's doing, not proof the Flow does it");
    expect(prompt).not.toContain("may predate the test");
    expect(prompt).toContain("for a changing step run again, what it changed or what the page answered");
    expect(prompt).toContain("observed.changed gives the lines about its own control first, then text that now reads otherwise");
    expect(automationStudioDiagnosisPromptInstruction("loop_verification")).not.toContain("kept what the build did while it explored");
  });
});

// The page before the run or test did anything (`startView`): run
// `run-mux6pndp-16feb842`'s judges both read "2 · $28.96" -- a soap and
// exploration's 3-Pack -- as the two towel packs; runs `run-musp8nz1-dbd3905a`
// and `run-musq0b1m-0472cfa0` read exploration's cart count and a collected
// coupon as the Flow's result. Each judge's request now says what startView is
// and to credit only what changed.
describe("each judge is told the page before it is not the Flow's doing, and to credit only what changed", () => {
  const FINISHED = "resultSummary.startView, where present, is the same view of the page before the run did anything: what it already shows -- a count, an entry in a reading list, a saved search, a chosen branch library -- predates the run and is not its doing; credit an act only where startView and endView differ on it or the act's own step shows it.";
  const TEST = "resultSummary.startView, where present, is that page just before the test did anything: what it already shows -- a count, an entry in a reading list, a saved search, a chosen branch library -- predates the test and is not its doing, so credit an act only where startView and endView differ on it or the act's own step shows it";
  // What the system prompt says for a post-run check, and for a build's test (`deepseek/system-prompt.ts` picks by `resultSummary.buildTest`).
  const judged = (buildTest: boolean) => automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest });

  it("tells the post-run check, and reconciles the end view's sentence with it", () => {
    const finished = judged(false);
    expect(finished).toContain(FINISHED);
    expect(finished).toContain("do not suppose a step left undone what the view shows done and startView did not already show");
    expect(finished).not.toContain(TEST);
  });

  it("tells the judge of a build's test that startView is the page exploration left", () => {
    const test = judged(true);
    expect(test).toContain(TEST);
    expect(test).toContain(FINISHED);
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

// t273 S2 (D phase 2): Core holds the build to the route the person named only
// as far as each step's own claim of a place; whether the Flow really goes that
// way is the build-test judge's to see, from the steps and the person's words.
describe("the build-test judge is told a named route is part of what was asked", () => {
  it("says a Flow that starts deeper than the route's first place, or skips a place, does not do what was asked", () => {
    const sentence = "When the person's instructions name a route to follow -- pages, menus or links to go through in order -- a Flow that starts deeper than the route's first place, or skips a place on it, does not do what was asked.";
    expect(automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true }).endsWith(sentence)).toBe(true);
    expect(automationStudioDiagnosisPromptInstruction("loop_verification")).not.toContain("name a route to follow");
  });
});

// Live run `run-mv5uu9g1-9d80deea` (t477): a trial searched, filtered and read one page of 14 results; one judge read the
// start view -- the unfiltered search page, with five pages -- as the read's page and answered no for pages never read.
describe("each judge is told the start view is not the page a list read ran on", () => {
  const SENTENCE = "startView is never the page a list read ran on once an earlier step searched, filtered, sorted or went to another page: a read's pages, and whether a further page was found, are in that read's own account (reads, or its step's observed), so never judge a read's paging or count from what startView shows.";
  it("tells the post-run check and the build-test judge alike", () => {
    for (const buildTest of [false, true]) expect(automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest }), String(buildTest)).toContain(SENTENCE);
  });
});

// The judge's rule for a step that keeps less than the request asks before a
// read (t482, lane C rounds 10 and 12: `run-mv5uu9g1-9d80deea`,
// `run-mv62icw3-9118516f`). The judge was told only to refuse a Flow that
// could not narrow; a site filter narrower than the request's bound, before the
// read, was named by every judge and passed. The rule is the converse, written
// abstractly: its example is another kind of site, and it names no price, shop
// or product the Lab's scenarios use.
/** The sentences of the rule, as one string. */
const narrowingRule = (): string => {
  const at = AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION.indexOf("resultSummary.reads[].narrowedBefore");
  return AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION.slice(at, AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION.indexOf("is correct.", at) + "is correct.".length);
};

describe("the judge's rule for a step before a read that keeps less than asked", () => {
  it("is told to every result judge, of a finished run and of a build's test", () => {
    for (const buildTest of [false, true]) {
      const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest });
      expect(prompt).toContain("resultSummary.reads[].narrowedBefore");
      expect(prompt).toContain("a step before a read that keeps less than the request asks");
    }
  });

  it("says the removed rows have no witness, that the answer is no, and that the step is named in changed", () => {
    const said = narrowingRule();
    expect(said).toContain("never reached the read, so no condition's leftOutOnlyByThis and no count can show them");
    expect(said).toContain("so answer no");
    expect(said).toContain("in changed name that step by its nodeId");
    expect(said).toContain("A step whose words keep exactly what a clause of the request asks for, or that narrows nothing (a notice closed, a page opened), is correct.");
  });

  it("teaches nothing a Lab scenario could be passed by: no price, currency, shop or product", () => {
    const said = narrowingRule();
    expect(said).not.toMatch(/[$€£]|\bprice|\bunder\b|\bcart\b|\bstore\b|\bshop|earbud|friend|job|listing/iu);
    expect(said).toContain("library");
  });
});

// t574 (live run `run-mv7vor5f-ea4d08b4`): a correct yes was held for not quoting the request beside 37 left-out rows,
// most of them settled by a numeric bound's own values; judges matched rows to the wrong numbering of conditions, and
// read a presence test's left-out rows as a broken read. Core settles those rows and the judge is told so.
const settledRule = (): string => {
  const at = AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION.indexOf("The rows in a condition's leftOutSettled");
  return AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION.slice(at, AUTOMATION_STUDIO_RESULT_VERIFICATION_INSTRUCTION.indexOf("which is not a broken read.", at) + "which is not a broken read.".length);
};

describe("the judge's rule for rows Core settled, numbered conditions and presence tests", () => {
  it("is told to every result judge, of a finished run and of a build's test, after the quote-every-row rule it qualifies", () => {
    for (const buildTest of [false, true]) {
      const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest });
      expect(prompt.indexOf("leftOutSettled")).toBeGreaterThan(prompt.indexOf("a yes that leaves any such row without its quote is not taken as a yes"));
      expect(prompt).toContain(settledRule());
    }
  });

  it("says settled rows need no quote each, that the bound is quoted once, how conditions are named, and what presence means", () => {
    const said = settledRule();
    expect(said).toContain("none needs a quote beside it");
    expect(said).toContain("a yes quotes once, in a sentence that names that condition, the request's words stating the bound");
    expect(said).toContain("where the request states no such bound, those rows are ones it asks for");
    expect(said).toContain("Core names it condition N (wording) wherever it names it");
    expect(said).toContain("each written with (no value): such a row lacks what the condition looks for");
  });

  it("teaches nothing a Lab scenario could be passed by: no price, currency, shop, product, rating or marker of one", () => {
    const said = settledRule();
    expect(said).not.toMatch(/[$€£]|\bprice|\bunder\b|\bcart\b|\bstore\b|\bshop|earbud|friend|job|listing|rating|\bplus\b|sponsor|mutual/iu);
    expect(said).toContain("library");
  });
});

// Every judge is told what Core's `keptEveryRow` flag on a read means (t692,
// `../diagnosis-instructions.ts`): nothing in that read chose which rows the
// answer holds, so a yes holds each row it stored to the request's own words.
describe("the judges' prompt on keptEveryRow (t692)", () => {
  it("says what a read's keptEveryRow means, to the post-run check and the build-test judge alike", () => {
    for (const buildTest of [false, true]) {
      const prompt = automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest });
      expect(prompt).toContain("resultSummary.reads[].keptEveryRow, where present, is Core's flag on a read with no condition that kept every item it saw");
      expect(prompt).toContain("answer yes only if the request's own words ask for each row it stored");
    }
  });
});

it.each([false, true])("distinguishes retrieval text from literal title requirements in the actual judge prompt (buildTest=%s)", async (buildTest) => {
  const projectId = "project.query", flowId = "flow.query";
  const instruction: AutomationStudioFlowInstruction = {
    schemaVersion: "0.1", instructionId: "instruction.query", title: "Collect matching subjects",
    body: "Search using the stated query and return the subjects meeting the request.",
    scope: { kind: "flow", projectId, flowId }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
  };
  const resultSummary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0,
    recordSetCount: 0, recordSets: [], flowShape: [], withheld: false,
    ...(buildTest ? { buildTest: { kind: "build_test" as const, test: "ran" as const, steps: [] } } : {})
  };
  const prepared = await runAutomationStudioLlmHarness({ taskKind: "loop_verification", projectId, flowId, instructions: [instruction], resultSummary, deniedEvidenceKeys: [] });
  let outbound = "";
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:mock-query" },
    resolveSecret: async (input) => {
      outbound = input.outboundBody;
      return "test-secret";
    },
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "The result is incomplete.", diagnosis: { answersRequest: "no" } }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
  });
  const answered = await provider.runTask(prepared.request) as { response: { diagnosis: AutomationStudioLlmDiagnosisFields } };
  const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
  const system = body.messages.find((message) => message.role === "system")!.content;
  expect(system).toContain("A search query specifies how to retrieve candidates");
  expect(system).toContain("Apply a literal title or name requirement only when the request explicitly states it");
  expect(system).toContain("Judge each candidate's actual type and content");
  expect(system).toContain("a query match alone does not establish that it qualifies");
  expect(system.includes("When resultSummary.buildTest is present")).toBe(buildTest);
  const user = JSON.parse(body.messages.find((message) => message.role === "user")!.content);
  expect(user.context.instructions.instructions[0].body).toBe(instruction.body);
  expect(user.outputSchema.properties.diagnosis.additionalProperties).toBe(false);
  expect(answered.response.diagnosis.answersRequest).toBe("no");
});
