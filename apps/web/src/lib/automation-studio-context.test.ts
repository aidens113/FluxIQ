import { describe, expect, it } from "vitest";
import { resolveAutomationStudioContext, resolveClientRecordingProject, setAutomationStudioContext, type AutomationStudioWebContext } from "./automation-studio-context";

describe("Automation Studio web context", () => {
  it("isolates concurrent operators and prefers a client-specific override", () => {
    const contexts: Record<string, AutomationStudioWebContext> = {};
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", activeProjectId: "project.alpha" }, 100);
    setAutomationStudioContext(contexts, { operatorUserId: "operator.beta", activeProjectId: "project.beta" }, 200);
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", clientId: "client.special", activeProjectId: "project.special" }, 300);

    expect(resolveAutomationStudioContext(contexts, "operator.alpha", "client.default")?.activeProjectId).toBe("project.alpha");
    expect(resolveAutomationStudioContext(contexts, "operator.alpha", "client.special")?.activeProjectId).toBe("project.special");
    expect(resolveAutomationStudioContext(contexts, "operator.beta", "client.special")?.activeProjectId).toBe("project.beta");
    expect(resolveAutomationStudioContext(contexts, "operator.unknown", "client.special")).toBeUndefined();
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special" }, 301)).toEqual({ ok: true, projectId: "project.special" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.beta", clientId: "client.special" }, 301)).toEqual({ ok: true, projectId: "project.beta" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special", requestedProjectId: "project.beta" }, 301)).toMatchObject({ ok: false, code: "recording.project_context_mismatch" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special" }, 10_301)).toMatchObject({ ok: false, code: "recording.project_required" });
  });
});
