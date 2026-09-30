// The port a command reaches Core through, and whose session it runs under.

import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiRequest } from "../../../../../_shared/api.ts";
import { parseAutomationStudioPanelCapabilities } from "../../../panel-capabilities/index.ts";
import { automationStudioConversationEffectiveCaller, AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX } from "../caller.ts";
import { automationStudioConversationCommandPort } from "../port.ts";
import { automationStudioConversationCommandVocabulary } from "../vocabulary.ts";

const actor = { sessionId: "session.person", userId: "user.person", roleId: "admin", permissions: ["programs.read" as const, "flows.write" as const] };

describe("automationStudioConversationCommandPort", () => {
  it("calls the registry as the request's actor in its scope, and refuses anything that deletes", async () => {
    const registry = new GlobalProgramApiRegistry();
    const seen: ProgramApiRequest[] = [];
    registry.register({ programId: "automation-studio", endpoint: "save-flow-instruction", permission: "flows.write", classification: "authoring", handler: (request) => { seen.push(request); return { ok: true, payload: { saved: true } }; } });
    registry.register({ programId: "automation-studio", endpoint: "delete-flow", permission: "flows.write", classification: "destructive", handler: (request) => { seen.push(request); return { ok: true }; } });
    registry.register({ programId: "automation-studio", endpoint: "wipe-everything", permission: "flows.write", classification: "destructive-ungated", handler: (request) => { seen.push(request); return { ok: true }; } });
    const port = automationStudioConversationCommandPort({ registry, actor, scope: { domainId: "domain.one" } });

    expect(await port.call("save-flow-instruction", { projectId: "project.one" })).toEqual({ ok: true, payload: { saved: true } });
    expect(seen[0]).toMatchObject({ programId: "automation-studio", endpoint: "save-flow-instruction", scope: { domainId: "domain.one" }, actor, payload: { projectId: "project.one" } });

    for (const endpoint of ["delete-flow", "wipe-everything"]) {
      const refused = await port.call(endpoint, { projectId: "project.one" });
      expect(refused.ok, endpoint).toBe(false);
      expect(refused.error, endpoint).toContain("only reads and authors");
    }
    expect((await port.call("no-such-endpoint", {})).ok).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it("keeps the endpoint's own permission check", async () => {
    const registry = new GlobalProgramApiRegistry();
    registry.register({ programId: "automation-studio", endpoint: "run-runtime-session", permission: "runtime.control", classification: "authoring", handler: () => ({ ok: true }) });
    const port = automationStudioConversationCommandPort({ registry, actor, scope: { domainId: null } });
    expect(await port.call("run-runtime-session", {})).toEqual({ ok: false, error: "Permission required: runtime.control" });
  });
});

describe("automationStudioConversationEffectiveCaller", () => {
  it("leaves a person's own session alone", () => {
    expect(automationStudioConversationEffectiveCaller({ userId: "u", sessionId: "session.1" }, () => "session.other")).toEqual({ userId: "u", sessionId: "session.1", paired: false, keyLocked: false });
  });

  it("maps a paired client to its person's unlocked session, or says the key is locked", () => {
    const paired = { userId: "u", sessionId: `${AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX}gateway.9` };
    expect(automationStudioConversationEffectiveCaller(paired, (userId) => (userId === "u" ? "session.unlocked" : null))).toEqual({ userId: "u", sessionId: "session.unlocked", paired: true, keyLocked: false });
    expect(automationStudioConversationEffectiveCaller(paired, () => null)).toEqual({ userId: "u", sessionId: paired.sessionId, paired: true, keyLocked: true });
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
