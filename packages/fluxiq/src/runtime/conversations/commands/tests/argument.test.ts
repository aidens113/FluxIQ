import { expect, it, vi } from "vitest";
import { automationStudioConversationCommandInstruction } from "../argument.ts";

it("a missing anchored person turn cannot self-certify the model argument", async () => {
  const host = { personWords: vi.fn().mockResolvedValue(null), appendAutomationTurn: async () => { throw new Error("unexpected_write"); }, pendingAsks: async () => [], getAsk: async () => null };
  expect(await automationStudioConversationCommandInstruction({ host, projectId: "p", conversationId: "c", answerTurnId: "missing-person" }, { title: "Create", phrases: [] }, { instruction: "Model-only goal." }, "instruction")).toBeNull();
});
