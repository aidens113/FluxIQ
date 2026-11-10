import { describe, expect, it } from "vitest";
import type { AutomationStudioConversationModel, AutomationStudioConversationModelRequest } from "../../../instructions/index.ts";
import { panelAssistantModelOf } from "../conversation-model.ts";

describe("panelAssistantModelOf", () => {
  it("sends the whole transcript, tool answers as the panel's reports, and counts what the call cost", async () => {
    const seen: AutomationStudioConversationModelRequest[] = [];
    const inner: AutomationStudioConversationModel = {
      name: "inner:model",
      decide: async (request, execution) => {
        seen.push(request);
        execution.paid?.(0.002);
        execution.paid?.(0.001);
        return '{"reply":"ok"}';
      }
    };
    const model = panelAssistantModelOf(inner);
    const reply = await model.decide(
      { instructions: "be helpful", transcript: [{ author: "person", text: "hi" }, { author: "assistant", text: "{\"tool\":\"find_tools\"}" }, { author: "tool", text: "{\"ok\":true}" }] },
      { signal: new AbortController().signal, caller: { userId: "u", sessionId: "s" } }
    );
    expect(reply).toEqual({ decision: '{"reply":"ok"}', costUsd: 0.003 });
    expect(model.name).toBe("inner:model");
    expect(seen[0]!.transcript).toEqual([{ author: "person", text: "hi" }, { author: "automation", text: "{\"tool\":\"find_tools\"}" }, { author: "panel", text: "{\"ok\":true}" }]);
    expect(seen[0]!.message).toContain("one JSON object");
    expect(seen[0]!.correction).toBeNull();
  });

  it("carries what a failed call was billed on the error it throws", async () => {
    const failure = Object.assign(new Error("malformed"), { retryable: false });
    const model = panelAssistantModelOf({
      name: "x",
      decide: async (_request, execution) => {
        execution.paid?.(0.004);
        throw failure;
      }
    });
    await expect(model.decide({ instructions: "", transcript: [] }, { signal: new AbortController().signal, caller: { userId: "u", sessionId: "s" } })).rejects.toMatchObject({ message: "malformed", costUsd: 0.004 });
  });
});
