import { describe, expect, it, vi } from "vitest";
import { executeAutomationStudioConversationCommand } from "../execute.ts";
import { automationStudioConversationCommandProgress, automationStudioModelKeySetupStep } from "../progress.ts";
import { automationStudioConversationModelProblem } from "../../instructions/index.ts";
import { automationStudioConversationEffectiveCaller } from "../caller.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "../create-here.ts";
import type { AutomationStudioConversationCommand, AutomationStudioConversationCommandContext } from "../command.ts";

const STEP = automationStudioModelKeySetupStep("signed_out");

function contextWith(keyNeedsUnlock: boolean) {
  const turns: string[] = [];
  const told = vi.fn();
  const context = {
    projectId: "project.one",
    conversationId: "conversation.one",
    sessionId: "client-gateway:one",
    keyLocked: keyNeedsUnlock,
    keyNeedsUnlock,
    keyLockReason: keyNeedsUnlock ? "signed_out" : null,
    noteKeySetupStepTold: told,
    paired: true,
    startLocation: null,
    host: { appendAutomationTurn: async (turn: { text: string }) => { turns.push(turn.text); } },
    port: { call: vi.fn(async () => { throw new Error("nothing may be called before the setup step is done"); }) }
  } as unknown as AutomationStudioConversationCommandContext;
  return { context, turns, told };
}

function commandThatNeedsTheKey(run: AutomationStudioConversationCommand["run"]): AutomationStudioConversationCommand {
  return { background: true, needsModelKey: true, capability: { id: "flow.fake", title: "Fake", summary: "", group: "Flows", control: "", arguments: [], phrases: [], consequences: [], reauthorizes: false }, run } as AutomationStudioConversationCommand;
}

describe("a locked key is found before a task starts", () => {
  it("shows the setup step, starts nothing and spends nothing", async () => {
    const run = vi.fn(async () => ({ status: "done" as const, summary: "built" }));
    const { context, turns, told } = contextWith(true);
    const execution = await executeAutomationStudioConversationCommand({ command: commandThatNeedsTheKey(run), context, arguments: {} });
    expect(run).not.toHaveBeenCalled();
    expect(execution).toEqual({ capabilityId: "flow.fake", status: "done", summary: STEP });
    expect(turns).toEqual([STEP]);
    expect(STEP).toContain("because you signed out");
    expect(told).toHaveBeenCalledOnce();
  });

  it("leaves a command alone when the key opens", async () => {
    const run = vi.fn(async () => ({ status: "done" as const, summary: "built" }));
    const { context } = contextWith(false);
    await expect(executeAutomationStudioConversationCommand({ command: { ...commandThatNeedsTheKey(run), background: false }, context, arguments: {} })).resolves.toMatchObject({ status: "done", summary: "built" });
    expect(run).toHaveBeenCalledOnce();
  });

  it("leaves a command that needs no key alone, locked or not: a saved Flow still runs", async () => {
    const run = vi.fn(async () => ({ status: "done" as const, summary: "ran" }));
    const { context } = contextWith(true);
    await expect(executeAutomationStudioConversationCommand({ command: { ...commandThatNeedsTheKey(run), background: false, needsModelKey: false }, context, arguments: {} })).resolves.toMatchObject({ summary: "ran" });
  });

  it("marks the work that cannot begin without the key", () => {
    expect(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.needsModelKey).toBe(true);
  });
});

describe("what a person reads", () => {
  it("never tells them to sign out, in the step or at the end of a failure", () => {
    const failed = automationStudioConversationCommandProgress("Fake", "unknown").failed("something broke");
    for (const words of [automationStudioModelKeySetupStep("first_unlock"), automationStudioModelKeySetupStep("unknown"), failed.summary]) {
      expect(words).not.toMatch(/sign out|sign in/iu);
      expect(words).toContain("Open FluxIQ");
    }
    // Only the words of why it locked may say they signed out, and never as the fix.
    expect(automationStudioModelKeySetupStep("signed_out")).not.toMatch(/sign (out|in) (of FluxIQ )?and/iu);
    expect(automationStudioConversationModelProblem({ code: "llm.provider_secret_unavailable" })).toContain("open FluxIQ");
    expect(automationStudioConversationModelProblem({ code: "llm.provider_secret_unavailable" })).not.toMatch(/sign out|sign in/iu);
  });
});

describe("the caller's need for an unlock", () => {
  const paired = { userId: "user.one", sessionId: "client-gateway:one" };
  const panel = { userId: "user.one", sessionId: "session.one" };

  it("a paired browser with its own unlock needs none", () => {
    const caller = automationStudioConversationEffectiveCaller(paired, () => "paired-client:one", ({ sessionId }) => (sessionId !== "paired-client:one" ? "unknown" : null));
    expect(caller).toMatchObject({ sessionId: "paired-client:one", keyLocked: false, keyNeedsUnlock: false });
  });

  it("a paired browser with no unlock needs one, when the person has a key", () => {
    expect(automationStudioConversationEffectiveCaller(paired, () => null, () => "signed_out")).toMatchObject({ sessionId: paired.sessionId, keyLocked: true, keyNeedsUnlock: true, keyLockReason: "signed_out" });
  });

  it("a person with no key at all needs something else, and is not told it is locked", () => {
    expect(automationStudioConversationEffectiveCaller(paired, () => null, () => null)).toMatchObject({ keyNeedsUnlock: false, keyLockReason: null });
  });

  it("a panel session falls back to another live unlock of theirs before it needs one", () => {
    const held = new Set(["session.other"]);
    const check = ({ sessionId }: { sessionId: string | null }) => (sessionId && held.has(sessionId) ? null : "first_unlock" as const);
    expect(automationStudioConversationEffectiveCaller(panel, () => "session.other", check)).toMatchObject({ keyNeedsUnlock: false, keyLocked: false });
    expect(automationStudioConversationEffectiveCaller(panel, () => null, check)).toMatchObject({ keyNeedsUnlock: true, keyLocked: false });
  });

  it("says nothing when the host bound no check", () => {
    expect(automationStudioConversationEffectiveCaller(paired, () => null)).toMatchObject({ keyNeedsUnlock: false, keyLocked: true });
  });
});
