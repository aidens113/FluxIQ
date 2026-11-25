// D12 (t1038): a DeepSeek reply whose answer is a function call has no content, and `response.txt` shows the call by
// name with its arguments laid out rather than as one escaped string.
import { describe, expect, it } from "vitest";
import { automationStudioLlmStepLogResponseText } from "../response-text.ts";

describe("the step log's reading of a DeepSeek function call", () => {
  it("shows the call by name with its arguments laid out, and the finish reason", () => {
    const reply = { choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call_0", type: "function", function: { name: "core_run_node", arguments: JSON.stringify({ summary: "Run it.", input: { node: "a.press" } }) } }] } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } };
    const read = automationStudioLlmStepLogResponseText(JSON.stringify(reply), 200);
    expect(read.finishReason).toBe("tool_calls");
    expect(read.text).toContain("==== tool call core_run_node");
    expect(read.text).toContain("node: a.press");
    expect(read.text).not.toContain("\\\"");
    expect(read.text).not.toContain("==== content");
  });
});
