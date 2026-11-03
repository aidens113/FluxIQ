// The conversation command port against the real program registry: two subjects, so it lives in the nearest
// directory that holds both, beside neither (test placement).

import { describe, expect, it } from "vitest";
import { automationStudioConversationCommandPort } from "../runtime/conversations/commands/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiRequest } from "../programs/_shared/api.ts";

const actor = { sessionId: "session.person", userId: "user.person", roleId: "admin", permissions: ["programs.read" as const, "flows.write" as const] };

describe("automationStudioConversationCommandPort", () => {
  it("calls the registry as the request's actor in its scope, and refuses anything that deletes", async () => {
    const registry = new GlobalProgramApiRegistry();
    const seen: ProgramApiRequest[] = [];
    registry.register({ programId: "automation-studio", endpoint: "save-flow-instruction", permission: "flows.write", classification: "authoring", handler: (request) => {
        seen.push(request);
        return { ok: true, payload: { saved: true } };
      } });
    registry.register({ programId: "automation-studio", endpoint: "delete-flow", permission: "flows.write", classification: "destructive", handler: (request) => {
        seen.push(request);
        return { ok: true };
      } });
    registry.register({ programId: "automation-studio", endpoint: "wipe-everything", permission: "flows.write", classification: "destructive-ungated", handler: (request) => {
        seen.push(request);
        return { ok: true };
      } });
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
