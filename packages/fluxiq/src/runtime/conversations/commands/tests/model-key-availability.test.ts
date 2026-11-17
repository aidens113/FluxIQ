// A connected client has the model: no command is held back on an unlock step, and the model-problem words never ask for one.

import { describe, expect, it, vi } from "vitest";
import { executeAutomationStudioConversationCommand } from "../execute.ts";
import { automationStudioConversationCommandProgress } from "../progress.ts";
import { automationStudioConversationModelProblem } from "../../instructions/index.ts";
import { automationStudioConversationEffectiveCaller } from "../caller.ts";
import type { AutomationStudioConversationCommand, AutomationStudioConversationCommandContext } from "../command.ts";

const context = { projectId: "project.one", conversationId: "conversation.one", sessionId: "client-gateway:one", paired: true, startLocation: null, host: { appendAutomationTurn: async () => undefined }, port: { call: vi.fn() } } as unknown as AutomationStudioConversationCommandContext;

function command(run: AutomationStudioConversationCommand["run"]): AutomationStudioConversationCommand {
  return { background: false, capability: { id: "flow.fake", title: "Fake", summary: "", group: "Flows", control: "", arguments: [], phrases: [], consequences: [], reauthorizes: false }, run } as AutomationStudioConversationCommand;
}

describe("a paired client's command is never held for an unlock", () => {
  it("runs the command on the client's own session", async () => {
    const run = vi.fn(async () => ({ status: "done" as const, summary: "built" }));
    await expect(executeAutomationStudioConversationCommand({ command: command(run), context, arguments: {} })).resolves.toMatchObject({ status: "done", summary: "built" });
    expect(run).toHaveBeenCalledOnce();
  });

  it("keeps the client's own gateway session as the caller, with nothing substituted", () => {
    expect(automationStudioConversationEffectiveCaller({ userId: "user.one", sessionId: "client-gateway:one" })).toEqual({ userId: "user.one", sessionId: "client-gateway:one", preferredSessionId: "client-gateway:one", paired: true });
  });
});

describe("what a person reads", () => {
  it("never asks for an unlock, a password or a sign-in, in a failure or in the model-problem words", () => {
    const failed = automationStudioConversationCommandProgress("Fake").failed("something broke");
    for (const words of [failed.summary, automationStudioConversationModelProblem({ code: "llm.provider_secret_unavailable" })]) {
      expect(words).not.toMatch(/unlock|password|sign (out|in)/iu);
    }
    expect(automationStudioConversationModelProblem({ code: "llm.provider_secret_unavailable" })).toContain("check the model key in FluxIQ");
  });
});
