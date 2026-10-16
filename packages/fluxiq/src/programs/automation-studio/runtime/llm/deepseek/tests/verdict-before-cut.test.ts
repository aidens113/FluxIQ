// A result verification cut off after its verdict is read for that verdict
// (t653, `../verdict-before-cut.ts`). Live run `run-mva6mlo8-f519063c`: four of
// 21 judge replies looped inside `summary` to the provider's 8,192-token
// ceiling and were refused whole. The replies here are a generic library
// catalogue, not a scenario the Lab measures.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { AutomationStudioLlmProviderError } from "../../provider-contract.ts";
import { parseAutomationStudioDeepSeekEnvelope } from "../response-envelope.ts";
import { automationStudioDeepSeekVerdictBeforeCut } from "../verdict-before-cut.ts";

const DIAGNOSIS = {
  expected: "Every library book published since 2000.",
  observed: "The read kept 12 books; condition 1 (year atLeast 2010) alone left out 3 books from 2003 to 2008.",
  changed: "Change condition 1 to year atLeast 2000.",
  stillAchievable: "yes",
  deterministicRecoveryPossible: "no",
  answersRequest: "no",
  explorationNeeded: false,
  patchNeeded: true
};
/** A summary that repeats one sentence until it is cut, as the live replies did. */
const LOOPING = `"summary":"The read kept 12 books. ${"That matches. ".repeat(600)}That mat`;
const HEAD = `{"kind":"diagnosis","diagnosis":${JSON.stringify(DIAGNOSIS)}`;
const USAGE = { prompt_tokens: 18_000, completion_tokens: 8_192, total_tokens: 26_192 };

const parse = (content: string, taskKind: AutomationStudioLlmTaskRequest["taskKind"] = "loop_verification") =>
  parseAutomationStudioDeepSeekEnvelope({ choices: [{ finish_reason: "length", message: { content } }], usage: USAGE }, request(taskKind), "deepseek-flash");

function refusalOf(run: () => unknown): AutomationStudioLlmProviderError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AutomationStudioLlmProviderError);
    return error as AutomationStudioLlmProviderError;
  }
  throw new Error("expected a refusal");
}

describe("a verification reply cut off after its diagnosis closed", () => {
  it("is read for its kind and diagnosis, marked cut after its verdict, with Core's sentence for the cut summary, and its cost", () => {
    const { response, usage } = parse(`${HEAD},"confidence":0.8,${LOOPING}`);
    expect(response).toEqual({ kind: "diagnosis", summary: expect.any(String), confidence: 0.8, diagnosis: DIAGNOSIS, truncatedAfterVerdict: true });
    expect(response.summary).toContain("cut off at the provider's output limit");
    expect(response.summary).not.toContain("That matches");
    expect(usage).toMatchObject({ inputTokens: 18_000, outputTokens: 8_192, totalTokens: 26_192 });
  });

  it("reads each verdict word, and a cut that falls anywhere after the diagnosis", () => {
    for (const answersRequest of ["yes", "no", "unknown"]) {
      const head = `{"kind":"diagnosis","diagnosis":${JSON.stringify({ ...DIAGNOSIS, answersRequest })}`;
      for (const tail of [",", `,"summ`, `,"summary"`, `,"summary":`, `,${LOOPING}`, `,"confidence":0.8`]) {
        expect(parse(`${head}${tail}`).response, `${answersRequest} ${tail.slice(0, 20)}`).toMatchObject({ diagnosis: { answersRequest }, truncatedAfterVerdict: true });
      }
    }
  });

  it("never reads a number the cut may have shortened", () => {
    // `0` may be the start of `0.8`: the member is dropped, never completed.
    expect(automationStudioDeepSeekVerdictBeforeCut(`${HEAD},"confidence":0`)).not.toHaveProperty("confidence");
  });

  it("never carries the summary, even one that closed before the cut", () => {
    const response = automationStudioDeepSeekVerdictBeforeCut(`{"kind":"diagnosis","summary":"Twelve books came back.","diagnosis":${JSON.stringify(DIAGNOSIS)},"confidence":0.`);
    expect(response).toMatchObject({ diagnosis: DIAGNOSIS, truncatedAfterVerdict: true });
    expect(response?.summary).not.toBe("Twelve books came back.");
  });
});

// Only Core marks a reply cut (round 2): a whole reply that claims the mark itself is read without it.
describe("a whole verification reply that claims it was cut", () => {
  it("is read as the whole reply it is, its claim dropped", () => {
    const content = JSON.stringify({ kind: "diagnosis", diagnosis: DIAGNOSIS, summary: "Judged.", truncatedAfterVerdict: true });
    const { response } = parseAutomationStudioDeepSeekEnvelope({ choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }, request("loop_verification"), "deepseek-flash");
    expect(response).toEqual({ kind: "diagnosis", diagnosis: DIAGNOSIS, summary: "Judged." });
  });
});

describe("a cut verification reply with no verdict before the cut", () => {
  it("is refused as cut off when the cut falls inside the diagnosis", () => {
    const inside = HEAD.slice(0, HEAD.indexOf("answersRequest") + 20);
    expect(refusalOf(() => parse(inside)).code).toBe("llm.provider_output_truncated");
    // Cut after every field, one `}` short of the diagnosis closing: still not closed.
    expect(refusalOf(() => parse(HEAD.slice(0, -1))).code).toBe("llm.provider_output_truncated");
    // And one character later it closed, so it is read.
    expect(parse(HEAD).response).toMatchObject({ diagnosis: DIAGNOSIS });
  });

  it("is refused when the summary came first and looped, as the live replies did", () => {
    expect(refusalOf(() => parse(`{"kind":"diagnosis",${LOOPING}`)).code).toBe("llm.provider_output_truncated");
  });

  it("is refused when its diagnosis carries no verdict, or kind does not lead", () => {
    const { answersRequest: _verdict, ...silent } = DIAGNOSIS;
    expect(refusalOf(() => parse(`{"kind":"diagnosis","diagnosis":${JSON.stringify(silent)},${LOOPING}`)).code).toBe("llm.provider_output_truncated");
    expect(refusalOf(() => parse(`{"diagnosis":${JSON.stringify(DIAGNOSIS)},"kind":"diagnosis",${LOOPING}`)).code).toBe("llm.provider_output_truncated");
    expect(refusalOf(() => parse(`{"kind":"diagnosis","diagnosis":${JSON.stringify({ ...DIAGNOSIS, answersRequest: "probably" })},${LOOPING}`)).code).toBe("llm.provider_output_truncated");
  });

  it("is refused for every other task kind, a runtime diagnosis included", () => {
    expect(refusalOf(() => parse(`${HEAD},${LOOPING}`, "runtime_diagnosis")).code).toBe("llm.provider_output_truncated");
  });

  it("is refused when it is not one object", () => {
    for (const content of [`\`\`\`json\n${HEAD},${LOOPING}`, `Verdict: ${HEAD},${LOOPING}`, `${HEAD}]],${LOOPING}`]) {
      expect(refusalOf(() => parse(content)).code, content.slice(0, 20)).toBe("llm.provider_output_truncated");
    }
  });
});

function request(taskKind: AutomationStudioLlmTaskRequest["taskKind"]): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "idempotency.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind,
    promptVersion: "automation-studio.loop-verification.v2",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind,
      promptVersion: "automation-studio.loop-verification.v2",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
    }
  } as AutomationStudioLlmTaskRequest;
}
