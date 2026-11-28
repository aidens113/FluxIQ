import { describe, expect, it } from "vitest";
import { resolveAutomationStudioContext, resolveClientRecordingProject, setAutomationStudioContext, type AutomationStudioWebContext } from "../automation-studio-context";

describe("Automation Studio web context", () => {
  it("isolates concurrent operators and prefers a client-specific override", () => {
    const contexts: Record<string, AutomationStudioWebContext> = {};
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", activeProjectId: "project.alpha" }, 100);
    setAutomationStudioContext(contexts, { operatorUserId: "operator.beta", activeProjectId: "project.beta" }, 200);
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", clientId: "client.special", activeProjectId: "project.special", activeFlowId: "flow.special" }, 300);

    expect(resolveAutomationStudioContext(contexts, "operator.alpha", "client.default")?.activeProjectId).toBe("project.alpha");
    expect(resolveAutomationStudioContext(contexts, "operator.alpha", "client.special")?.activeProjectId).toBe("project.special");
    expect(resolveAutomationStudioContext(contexts, "operator.beta", "client.special")?.activeProjectId).toBe("project.beta");
    expect(resolveAutomationStudioContext(contexts, "operator.unknown", "client.special")).toBeUndefined();
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special" })).toEqual({ ok: true, projectId: "project.special", taskId: "flow.special" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.beta", clientId: "client.special" })).toEqual({ ok: true, projectId: "project.beta" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special", requestedProjectId: "project.beta" })).toMatchObject({ ok: false, code: "recording.project_context_mismatch" });
  });

  it("records into the person's lasting current project however long ago it was set (t1095), and refuses only with none", () => {
    const contexts: Record<string, AutomationStudioWebContext> = {};
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", activeProjectId: "project.alpha" }, 0);
    // The value is the person's current project, not a mark that a page is open: its age says nothing.
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.one" })).toEqual({ ok: true, projectId: "project.alpha" });

    // Clearing it is an explicit write, and that refusal names no project.
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", activeProjectId: null }, 1);
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.one" })).toMatchObject({ ok: false, code: "recording.project_required", activeProjectId: null });
    expect(resolveClientRecordingProject(contexts, { clientId: "client.one" })).toMatchObject({ ok: false, code: "recording.project_required", activeProjectId: null, contextUpdatedAt: 0 });
  });
});
