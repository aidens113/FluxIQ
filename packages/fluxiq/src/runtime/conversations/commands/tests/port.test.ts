// Whose session a command runs under, and the vocabulary it is shown. The port itself is tested against the registry in src/tests/.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../../framework/automation-service/panel-capabilities/index.ts";
import { automationStudioConversationEffectiveCaller, AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX } from "../caller.ts";
import { automationStudioConversationCommandVocabulary } from "../vocabulary.ts";

describe("automationStudioConversationEffectiveCaller", () => {
  it("leaves a person's own session alone", () => {
    expect(automationStudioConversationEffectiveCaller({ userId: "u", sessionId: "session.1" }, () => "session.other")).toEqual({ userId: "u", sessionId: "session.1", preferredSessionId: "session.1", paired: false, keyLocked: false });
  });

  // The session is only where model calls start: each call resolves the person's live unlock again (H0-S5).
  it("maps a paired client to its person's unlocked session, or says the key is locked", () => {
    const paired = { userId: "u", sessionId: `${AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX}gateway.9` };
    expect(automationStudioConversationEffectiveCaller(paired, (userId) => (userId === "u" ? "session.unlocked" : null))).toEqual({ userId: "u", sessionId: "session.unlocked", preferredSessionId: "session.unlocked", paired: true, keyLocked: false });
    expect(automationStudioConversationEffectiveCaller(paired, () => null)).toEqual({ userId: "u", sessionId: paired.sessionId, preferredSessionId: null, paired: true, keyLocked: true });
    expect(automationStudioConversationEffectiveCaller(paired, null)).toMatchObject({ sessionId: paired.sessionId, keyLocked: true });
  });
});

describe("automationStudioConversationCommandVocabulary", () => {
  it("replaces a client's descriptor with Core's for the ids Core runs, and adds none", () => {
    const sent = parseAutomationStudioPanelCapabilities([{ id: "flow.createHere" }, { id: "run.list", title: "List recent runs" }, { id: "run.execute", title: "Old title", arguments: [{ name: "projectId", required: true }] }]);
    const shown = automationStudioConversationCommandVocabulary(sent);
    expect(shown.map((capability) => capability.id)).toEqual(["flow.createHere", "run.list", "run.execute"]);
    expect(shown[0]?.arguments.map((argument) => argument.name)).toEqual(["instruction", "name"]);
    expect(shown[1]).toBe(sent[1]);
    expect(shown[2]?.title).toBe("Run a Flow");
  });
});
