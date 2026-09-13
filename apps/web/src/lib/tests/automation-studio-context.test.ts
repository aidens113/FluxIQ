import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_CONTEXT_LEASE_MS, resolveAutomationStudioContext, resolveClientRecordingProject, setAutomationStudioContext, type AutomationStudioWebContext } from "../automation-studio-context";

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
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special" }, 301)).toEqual({ ok: true, projectId: "project.special", taskId: "flow.special" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.beta", clientId: "client.special" }, 301)).toEqual({ ok: true, projectId: "project.beta" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special", requestedProjectId: "project.beta" }, 301)).toMatchObject({ ok: false, code: "recording.project_context_mismatch" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.special" }, 300 + AUTOMATION_STUDIO_CONTEXT_LEASE_MS)).toMatchObject({ ok: false, code: "recording.project_required" });
  });

  it("keeps a context usable for the whole lease, then stops directing recordings", () => {
    const contexts: Record<string, AutomationStudioWebContext> = {};
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", activeProjectId: "project.alpha" }, 0);

    // Past the lease the refusal still names the project. That is how the
    // extension tells a Studio that went quiet from nobody having opened a
    // project at all, and only the first is worth retrying.
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.one" }, AUTOMATION_STUDIO_CONTEXT_LEASE_MS - 1)).toEqual({ ok: true, projectId: "project.alpha" });
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.one" }, AUTOMATION_STUDIO_CONTEXT_LEASE_MS)).toMatchObject({ ok: false, code: "recording.project_required", activeProjectId: "project.alpha" });

    // A page that closed cleanly cleared its project, and that refusal is
    // final however recently it arrived.
    setAutomationStudioContext(contexts, { operatorUserId: "operator.alpha", activeProjectId: null }, AUTOMATION_STUDIO_CONTEXT_LEASE_MS);
    expect(resolveClientRecordingProject(contexts, { operatorUserId: "operator.alpha", clientId: "client.one" }, AUTOMATION_STUDIO_CONTEXT_LEASE_MS + 1)).toMatchObject({ ok: false, code: "recording.project_required", activeProjectId: null });
  });
});
