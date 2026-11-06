// What DeepSeek does with the two replies Anthropic's JSON-text path used to lose (paid run `run-mw3itjcy-ce4429f7`, steps 67
// and 74, with made-up words; `../../anthropic/task-answer.ts`). Nothing changed here, and these say so: this adapter holds
// no reply to the whole schema, so a long text was already read, and its reader takes a wrong outer word as another answer.
import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL } from "../index.ts";
import { parseAutomationStudioDeepSeekEnvelope } from "../response-envelope.ts";

const LIMITS = { tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 } };
const taskOf = (taskKind: AutomationStudioLlmTaskRequest["taskKind"]) => ({ taskKind, ...LIMITS }) as AutomationStudioLlmTaskRequest;
const choices = (value: unknown) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });

describe("two replies off the schema, on DeepSeek", () => {
  it("a judge's yes with a text past its bound was already read whole", () => {
    const reply = { kind: "diagnosis", diagnosis: { observed: "x".repeat(575), answersRequest: "yes", defects: [] }, confidence: 0.8, summary: "Met." };
    expect(parseAutomationStudioDeepSeekEnvelope(choices(reply), taskOf("loop_verification"), AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL).response).toEqual(reply);
  });

  it("a sound decision under the wrong outer word stays refused, with no account of the reply", () => {
    const reply = { kind: "amend_draft", summary: "Drop them.", decision: { kind: "amend_draft", amendments: [{ step: 20, change: "drop" }] } };
    let failure: { code?: string; reply?: unknown } | undefined;
    try {
      parseAutomationStudioDeepSeekEnvelope(choices(reply), taskOf("evidence_tool_decision"), AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL);
    } catch (error) {
      failure = error as { code?: string; reply?: unknown };
    }
    expect(failure?.code).toBe("llm.provider_output_invalid");
    expect(failure?.reply).toBeUndefined();
  });
});
