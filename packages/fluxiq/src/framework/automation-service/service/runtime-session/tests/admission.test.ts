import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import { admitAutomationStudioRuntimeSession } from "../admission.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../../../../../runtime/project-agents/host-resources/index.ts";

function session(runId: string, status: AutomationStudioRuntimeSession["status"], adaptiveRuntime: boolean): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId,
    projectId: "project.one",
    targetKind: "flow",
    targetId: "flow.one",
    flowId: "flow.one",
    status,
    queuedAt: 1,
    flow: { flowId: "flow.one" } as AutomationStudioRuntimeSession["flow"],
    metadata: { adaptiveRuntime }
  };
}

function ports(sessions: () => Promise<AutomationStudioRuntimeSession[]>) {
  const started = session("run.new", "queued", true);
  return {
    admissions: new Set<string>(),
    listRuntimeSessions: vi.fn(sessions),
    startRuntimeSession: vi.fn(async () => started),
    started
  };
}

describe("admitting a run", () => {
  it("admits independent leased browsers in one project and retains the unleased project gate", async () => {
    let epoch = 0;
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler({ capacity: 2,
      acquire: () => ({ resourceKey: `host-${++epoch}`, sessionId: `session-${epoch}`, epoch }), release: () => undefined }));
    const access = ports(async () => [session("run.active", "running", true)]);
    await Promise.all(["one", "two"].map((briefId) => scope.run({ role: "run", briefId }, async () => {
      await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).resolves.toBe(access.started);
    })));
    expect(access.startRuntimeSession).toHaveBeenCalledTimes(2);
    await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).rejects.toThrow("Only one adaptive runtime run");
  });

  it("does not admit a late callback under a released lease", async () => {
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler({ capacity: 1,
      acquire: () => ({ resourceKey: "host", sessionId: "session", epoch: 1 }), release: () => undefined }));
    const access = ports(async () => [session("run.active", "running", true)]);
    let resume = (): void => undefined;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    let late: Promise<AutomationStudioRuntimeSession>;
    await scope.run({ role: "run", briefId: "one" }, async () => { late = gate.then(() => admitAutomationStudioRuntimeSession(access, "project.one", true)); });
    resume();
    await expect(late!).rejects.toThrow("Only one adaptive runtime run");
  });

  it("keeps the project gate for an advisory scope that does not exclude other drivers", async () => {
    const scope = new AutomationStudioHostLeaseScope(new AutomationStudioHostResourceScheduler({ capacity: 1,
      acquire: () => ({ resourceKey: "host", sessionId: "session", epoch: 1 }), release: () => undefined }), { strict: false });
    const access = ports(async () => [session("run.active", "running", true)]);
    await scope.run({ role: "run", briefId: "advisory" }, async () => {
      await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).rejects.toThrow("Only one adaptive runtime run");
    });
  });
  it("starts a run that is not adaptive, or has no project, without reading the sessions", async () => {
    const access = ports(async () => { throw new Error("not read"); });

    await expect(admitAutomationStudioRuntimeSession(access, "project.one", false)).resolves.toBe(access.started);
    await expect(admitAutomationStudioRuntimeSession(access, null, true)).resolves.toBe(access.started);

    expect(access.listRuntimeSessions).not.toHaveBeenCalled();
    expect(access.startRuntimeSession).toHaveBeenCalledTimes(2);
  });

  it("starts an adaptive run when no other adaptive run is active, and releases the project", async () => {
    const access = ports(async () => [
      session("run.done", "succeeded", true),
      session("run.plain", "running", false)
    ]);

    await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).resolves.toBe(access.started);

    expect(access.listRuntimeSessions).toHaveBeenCalledWith("project.one");
    expect(access.admissions.size).toBe(0);
  });

  it.each(["queued", "running", "waiting"] as const)("refuses an adaptive run beside a %s adaptive run", async (status) => {
    const access = ports(async () => [session("run.active", status, true)]);

    await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).rejects.toThrow("Only one adaptive runtime run can be active per project.");

    expect(access.startRuntimeSession).not.toHaveBeenCalled();
    expect(access.admissions.size).toBe(0);
  });

  it("refuses an adaptive run while another is being admitted in the same project", async () => {
    const access = ports(async () => []);
    access.admissions.add("project.one");

    await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).rejects.toThrow("Only one adaptive runtime run can be admitted per project at a time.");

    expect(access.listRuntimeSessions).not.toHaveBeenCalled();
    expect(access.admissions.has("project.one")).toBe(true);
  });

  it("refuses an adaptive run when the sessions cannot be read, and releases the project", async () => {
    const access = ports(async () => { throw new Error("sessions unreadable"); });

    await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).rejects.toThrow("sessions unreadable");

    expect(access.startRuntimeSession).not.toHaveBeenCalled();
    expect(access.admissions.size).toBe(0);
  });

  it("releases the project when the session cannot be started", async () => {
    const access = { ...ports(async () => []), startRuntimeSession: vi.fn(async () => { throw new Error("write failed"); }) };

    await expect(admitAutomationStudioRuntimeSession(access, "project.one", true)).rejects.toThrow("write failed");

    expect(access.admissions.size).toBe(0);
  });
});
