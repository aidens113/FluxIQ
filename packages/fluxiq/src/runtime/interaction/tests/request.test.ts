import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_ASK_EFFECT,
  automationStudioAskEffect,
  automationStudioConversationAnswerFits,
  automationStudioConversationAskIsConsequential,
  automationStudioConversationAskRoute,
  type AutomationStudioAskDraft,
  type AutomationStudioConversationAsk
} from "../index.ts";

describe("runtime interaction contracts", () => {
  it("emits the same ask wire payload without translating the request", () => {
    const draft = {
      askId: "request.record",
      kind: "choice",
      parks: true,
      text: "Which destination should receive the record?",
      options: [{ id: "archive", label: "Archive", route: "archived" }],
      routes: { granted: "saved", denied: "cancelled", timedOut: null }
    } satisfies AutomationStudioAskDraft;
    const effect = automationStudioAskEffect(draft);
    expect(effect.type).toBe("ask.requested");
    expect(effect.payload).toBe(draft);
    expect(JSON.parse(JSON.stringify(effect))).toEqual({ type: AUTOMATION_STUDIO_ASK_EFFECT, payload: draft });
  });

  it("retains choice and timeout route semantics and the consequential answer boundary", () => {
    const ask = storedAsk();
    expect(automationStudioConversationAskRoute(ask)).toBe("archived");
    expect(automationStudioConversationAskIsConsequential(ask)).toBe(false);
    expect(automationStudioConversationAskIsConsequential({ ...ask, consequences: ["send_or_publish"] })).toBe(true);
    expect(automationStudioConversationAskRoute({ ...ask, status: "expired", onTimeout: "deny" })).toBe("cancelled");
    expect(automationStudioConversationAskRoute({ ...ask, status: "expired", onTimeout: "default" })).toBe("later");
    expect(automationStudioConversationAnswerFits("permission", "grant")).toBe(true);
    expect(automationStudioConversationAnswerFits("permission", "text")).toBe(false);
  });
});

function storedAsk(): AutomationStudioConversationAsk {
  return {
    askId: "request.record",
    conversationId: "conversation.record",
    turnId: "turn.record",
    kind: "choice",
    status: "answered",
    parks: true,
    timeoutMs: null,
    onTimeout: null,
    options: [{ id: "archive", label: "Archive", route: "archived" }],
    routes: { granted: "saved", denied: "cancelled", timedOut: "later" },
    consequences: ["create_new"],
    missing: null,
    control: null,
    permissionRequest: null,
    createdAt: 1,
    answer: { askId: "request.record", answeredAt: 2, kind: "choice", value: "archive", actorId: null }
  };
}
