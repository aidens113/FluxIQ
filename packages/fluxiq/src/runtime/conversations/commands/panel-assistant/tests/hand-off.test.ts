// The panel's chat in a project hands a message to the panel assistant through its own endpoint, with the
// turn Core wrote in answer so the endpoint reads the person's words and selection; a paired client never
// hands anything over; the vocabulary a panel offers carries Core's own descriptor for it.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../../../framework/automation-service/panel-capabilities/index.ts";
import type { AutomationStudioConversationCommandContext } from "../../command.ts";
import { automationStudioConversationCommandVocabulary } from "../../vocabulary.ts";
import { AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT } from "../hand-off.ts";

function context(answer: { ok: boolean; payload?: unknown; error?: string }, over: Partial<AutomationStudioConversationCommandContext> = {}) {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const value = {
    port: {
      call: async (endpoint: string, payload: Record<string, unknown>) => {
        calls.push([endpoint, payload]);
        return answer;
      }
    },
    host: { appendAutomationTurn: async () => { throw new Error("not written here"); }, pendingAsks: async () => [], getAsk: async () => null },
    projectId: "p.1",
    conversationId: "conversation.c1",
    sessionId: "session.1",
    paired: false,
    startLocation: null,
    answerTurnId: "turn.answer",
    ...over
  } as AutomationStudioConversationCommandContext;
  return { value, calls };
}

describe("handing a message to the panel's tools", () => {
  it("calls the assistant's endpoint for this thread and answer, and says how the work ended", async () => {
    const { value, calls } = context({ ok: true, payload: { ending: "asked", spentUsd: 0.01 } });
    const outcome = await AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT.run(value, {});
    expect(calls).toEqual([["work-in-project-thread", { projectId: "p.1", conversationId: "conversation.c1", answerTurnId: "turn.answer" }]]);
    expect(outcome).toMatchObject({ status: "done", summary: "Waiting for your answer above." });
  });

  it("says why when the hand-over was refused, and never hands over for a paired client", async () => {
    const refused = context({ ok: false, error: "Not authorized: studio:WorkInProjectThread" });
    expect(await AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT.run(refused.value, {})).toMatchObject({ status: "failed" });
    const paired = context({ ok: true }, { paired: true });
    expect(await AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT.run(paired.value, {})).toMatchObject({ status: "failed" });
    expect(paired.calls).toEqual([]);
  });

  it("is a capability a panel vocabulary can carry, shown with Core's own descriptor", () => {
    const sent = parseAutomationStudioPanelCapabilities([{ ...AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT.capability, title: "whatever the client said" }]);
    expect(automationStudioConversationCommandVocabulary(sent)).toEqual([AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT.capability]);
  });
});
