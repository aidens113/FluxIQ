import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_ASK_EFFECT,
  automationStudioAskEffect,
  automationStudioConversationAnswerFits,
  automationStudioConversationAskIsConsequential,
  automationStudioConversationAskRoute,
  type AutomationStudioAskDraft
} from "../../../runtime/interaction/index.ts";
import {
  AUTOMATION_STUDIO_ACTION_CONSEQUENCES,
  automationStudioActionPermissionSentence,
  parseAutomationStudioActionPermissionRequest
} from "../../../runtime/action-permissions/index.ts";
import * as studioAsk from "../../../runtime/conversations/index.ts";
import * as studioParking from "../../../runtime/automation-parking/index.ts";
import * as studioPermissions from "../../../runtime/action-permission-requests/index.ts";

describe("Studio compatibility with framework runtime contracts", () => {
  it("shares the ask effect and answer rules with the canonical interaction ports", () => {
    expect(studioParking.AUTOMATION_STUDIO_ASK_EFFECT).toBe(AUTOMATION_STUDIO_ASK_EFFECT);
    expect(studioParking.automationStudioAskEffect).toBe(automationStudioAskEffect);
    expect(studioAsk.automationStudioConversationAskRoute).toBe(automationStudioConversationAskRoute);
    expect(studioAsk.automationStudioConversationAnswerFits).toBe(automationStudioConversationAnswerFits);
    expect(studioAsk.automationStudioConversationAskIsConsequential).toBe(automationStudioConversationAskIsConsequential);
  });

  it("lets the retained parser read the canonical effect without changing its wire payload", () => {
    const draft = {
      askId: "request.record",
      kind: "choice",
      parks: true,
      text: "Which destination should receive the record?",
      options: [{ id: "archive", label: "Archive", route: "archived" }],
      routes: { granted: "saved", denied: "cancelled", timedOut: null }
    } satisfies AutomationStudioAskDraft;
    expect(studioParking.automationStudioAskInEffects([automationStudioAskEffect(draft)], { askId: "attempt.1", stage: "execution" })).toMatchObject({
      ...draft,
      status: "pending",
      raisedBy: { stage: "execution" }
    });
  });

  it("retains singleton consequence vocabulary and permission parser identity", () => {
    expect(studioPermissions.AUTOMATION_STUDIO_ACTION_CONSEQUENCES).toBe(AUTOMATION_STUDIO_ACTION_CONSEQUENCES);
    expect(studioPermissions.parseAutomationStudioActionPermissionRequest).toBe(parseAutomationStudioActionPermissionRequest);
    expect(studioPermissions.automationStudioActionPermissionSentence).toBe(automationStudioActionPermissionSentence);
  });
});
