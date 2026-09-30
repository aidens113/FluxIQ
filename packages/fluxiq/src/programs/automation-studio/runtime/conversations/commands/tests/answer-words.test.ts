import { describe, expect, it } from "vitest";
import type { AutomationStudioConversationAsk } from "../../ask.ts";
import { automationStudioConversationAnswerFromWords } from "../answer-words.ts";

function ask(kind: AutomationStudioConversationAsk["kind"], options: AutomationStudioConversationAsk["options"] = null): AutomationStudioConversationAsk {
  return {
    askId: "ask.1", conversationId: "conversation.1", turnId: "turn.1", kind, status: "pending", parks: false, timeoutMs: null, onTimeout: null,
    options, routes: null, consequences: null, missing: null, control: null, permissionRequest: null, createdAt: 0, answer: null
  };
}

describe("automationStudioConversationAnswerFromWords", () => {
  it("reads a yes or a no to a permission or a confirmation, and nothing it cannot tell", () => {
    for (const words of ["yes", "Yes, go ahead.", "ok", "sure thing", "do it", "apply it"]) expect(automationStudioConversationAnswerFromWords(ask("confirm"), words), words).toEqual({ kind: "grant" });
    for (const words of ["no", "No thanks", "don't", "cancel", "not now"]) expect(automationStudioConversationAnswerFromWords(ask("permission"), words), words).toEqual({ kind: "deny" });
    for (const words of ["maybe", "what would it do?", ""]) expect(automationStudioConversationAnswerFromWords(ask("confirm"), words), words).toBeNull();
  });

  it("names an option by its label, its place or its closest match", () => {
    const choice = ask("choice", [{ id: "opt.small", label: "Small kettle", route: null }, { id: "opt.large", label: "Large kettle", route: null }]);
    expect(automationStudioConversationAnswerFromWords(choice, "Large kettle")).toEqual({ kind: "choice", value: "opt.large" });
    expect(automationStudioConversationAnswerFromWords(choice, "the first one")).toEqual({ kind: "choice", value: "opt.small" });
    expect(automationStudioConversationAnswerFromWords(choice, "the large one please")).toEqual({ kind: "choice", value: "opt.large" });
  });

  it("passes an open question's answer on as the person wrote it", () => {
    expect(automationStudioConversationAnswerFromWords(ask("open"), " Blue, please ")).toEqual({ kind: "text", value: "Blue, please" });
  });
});
