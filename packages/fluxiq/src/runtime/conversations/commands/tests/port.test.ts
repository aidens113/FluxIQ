// Whose session a command runs under, and the vocabulary it is shown. The port itself is tested against the registry in src/tests/.

import { describe, expect, it } from "vitest";
import { parseAutomationStudioPanelCapabilities } from "../../../../framework/automation-service/panel-capabilities/index.ts";
import { automationStudioConversationEffectiveCaller, AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX } from "../caller.ts";
import { automationStudioConversationCommandVocabulary } from "../vocabulary.ts";

describe("automationStudioConversationEffectiveCaller", () => {
  it("keeps a person's own session as it is", () => {
    expect(automationStudioConversationEffectiveCaller({ userId: "u", sessionId: "session.1" })).toEqual({ userId: "u", sessionId: "session.1", preferredSessionId: "session.1", paired: false });
  });

  // A connected client is connected: its own gateway session stays the principal, with no substitute session and no unlock.
  it("keeps a paired client's own session and says it is paired", () => {
    const paired = { userId: "u", sessionId: `${AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX}gateway.9` };
    expect(automationStudioConversationEffectiveCaller(paired)).toEqual({ userId: "u", sessionId: paired.sessionId, preferredSessionId: paired.sessionId, paired: true });
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
