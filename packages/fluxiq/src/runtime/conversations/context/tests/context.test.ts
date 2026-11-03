import { describe, expect, it } from "vitest";
import { currentAutomationStudioConversation } from "../current.ts";
import { runInAutomationStudioConversation } from "../run.ts";

describe("the ambient conversation", () => {
  it("is the thread the work was started from, across awaits, and only for its own project", async () => {
    expect(currentAutomationStudioConversation("project.one")).toBeNull();
    await runInAutomationStudioConversation({ projectId: "project.one", conversationId: "conversation.chat" }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(currentAutomationStudioConversation("project.one")).toEqual({ projectId: "project.one", conversationId: "conversation.chat" });
      expect(currentAutomationStudioConversation("project.two")).toBeNull();
    });
    expect(currentAutomationStudioConversation("project.one")).toBeNull();
  });
});
