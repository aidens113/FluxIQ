import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_CONTEXT_LEASE_MS } from "../../../automation-studio-context";
import { createWorkspacePresentations } from "../index";
import { hostFacts, instanceFixture, recordingInput } from "./fixture";

describe("workspace instance context ownership", () => {
  it("isolates identical user/client/project ids in two tenant runtimes", async () => {
    const registry = createWorkspacePresentations({ now: () => 100 });
    const left = registry.bind({ workspaceId: "tenant.one", instance: instanceFixture("one").instance, runtimeId: "runtime.one", profile: "service" });
    const right = registry.bind({ workspaceId: "tenant.two", instance: instanceFixture("two").instance, runtimeId: "runtime.two", profile: "service" });
    const caller = { userId: "user.same", clientId: "client.same" };
    left.forCaller(caller).beginContextWrite().commit({ activeProjectId: "project.same", activeFlowId: "flow.one" });
    right.forCaller(caller).beginContextWrite().commit({ activeProjectId: "project.same", activeFlowId: "flow.two" });
    expect(left.forCaller(caller).context()).toMatchObject({ activeProjectId: "project.same", activeFlowId: "flow.one" });
    expect(right.forCaller(caller).context()).toMatchObject({ activeProjectId: "project.same", activeFlowId: "flow.two" });
    expect(await left.recordingContextProvider(recordingInput())).toEqual({ ok: true, projectId: "project.same", taskId: "flow.one" });
    expect(await right.recordingContextProvider(recordingInput())).toEqual({ ok: true, projectId: "project.same", taskId: "flow.two" });
  });

  it("reuses client preference and scopes counts to the current user/client", () => {
    const registry = createWorkspacePresentations({ now: () => 100 });
    const owner = registry.bind({ workspaceId: "tenant.one", instance: instanceFixture().instance, runtimeId: "runtime.one", profile: "service" });
    owner.forCaller({ userId: "person.one" }).beginContextWrite().commit({ activeProjectId: "project.default" });
    owner.forCaller({ userId: "person.one", clientId: "client.one" }).beginContextWrite().commit({ activeProjectId: "project.one" });
    owner.forCaller({ userId: "person.one", clientId: "client.two" }).beginContextWrite().commit({ activeProjectId: "project.two" });
    owner.forCaller({ userId: "person.foreign" }).beginContextWrite().commit({ activeProjectId: "project.foreign" });
    const first = owner.forCaller({ userId: "person.one", clientId: "client.one" });
    expect(first.context()?.activeProjectId).toBe("project.one");
    expect(first.present(hostFacts).automationStudio.contextCount).toBe(2);
    expect(owner.forCaller({ userId: "person.one", clientId: "unknown" }).context()?.activeProjectId).toBe("project.default");
    expect(owner.forCaller({ userId: "person.one", clientId: "unknown" }).present(hostFacts).automationStudio.contextCount).toBe(1);
    expect(owner.forCaller({ userId: "person.one" }).present(hostFacts).automationStudio.contextCount).toBe(3);
    expect(owner.forCaller({ userId: "person.none" }).present(hostFacts).automationStudio.contextCount).toBe(0);
  });

  it("keeps normalized selections and returns detached context data", () => {
    const registry = createWorkspacePresentations({ now: () => 100 });
    const owner = registry.bind({ workspaceId: "tenant.one", instance: instanceFixture().instance, runtimeId: "runtime.one", profile: "service" });
    const caller = { userId: "person.one", clientId: "client.one" };
    const view = owner.forCaller(caller);
    caller.userId = "person.changed-later";
    view.beginContextWrite().commit({ activeProjectId: "  project.one  ", activeFlowId: " flow.one " });
    const context = view.context()!;
    expect(context).toMatchObject({ operatorUserId: "person.one", activeProjectId: "project.one", activeFlowId: "flow.one", updatedAt: 100 });
    context.activeProjectId = "mutated";
    expect(view.context()?.activeProjectId).toBe("project.one");
    view.beginContextWrite().commit({ activeProjectId: null, activeFlowId: "must-clear" });
    expect(view.context()).toMatchObject({ activeProjectId: null, activeFlowId: null });
  });

  it("a newer write intent prevents an older awaited write from restoring context", () => {
    const registry = createWorkspacePresentations();
    const owner = registry.bind({ workspaceId: "tenant.one", instance: instanceFixture().instance, runtimeId: "runtime.one", profile: "service" });
    const view = owner.forCaller({ userId: "person.one" });
    const old = view.beginContextWrite();
    const current = view.beginContextWrite();
    current.commit({ activeProjectId: "project.current" });
    expect(() => old.commit({ activeProjectId: "project.stale" })).toThrowError(expect.objectContaining({ code: "context_write_stale" }));
    expect(() => current.commit({ activeProjectId: "repeated" })).toThrowError(expect.objectContaining({ code: "context_write_stale" }));
    expect(view.context()?.activeProjectId).toBe("project.current");
  });

  it("reuses the existing recording resolver freshness and mismatch semantics", async () => {
    let now = 0;
    const registry = createWorkspacePresentations({ now: () => now });
    const owner = registry.bind({ workspaceId: "tenant.one", instance: instanceFixture().instance, runtimeId: "runtime.one", profile: "service" });
    owner.forCaller({ userId: "user.same", clientId: "client.same" }).beginContextWrite().commit({ activeProjectId: "project.one", activeFlowId: "flow.one" });
    now = AUTOMATION_STUDIO_CONTEXT_LEASE_MS - 1;
    expect(await owner.recordingContextProvider(recordingInput())).toEqual({ ok: true, projectId: "project.one", taskId: "flow.one" });
    expect(await owner.recordingContextProvider(recordingInput("user.same", "client.same", "project.foreign"))).toMatchObject({ ok: false, code: "recording.project_context_mismatch", metadata: { activeProjectId: "project.one", contextUpdatedAt: 0 } });
    now = AUTOMATION_STUDIO_CONTEXT_LEASE_MS;
    expect(await owner.recordingContextProvider(recordingInput())).toMatchObject({ ok: false, code: "recording.project_required", metadata: { activeProjectId: "project.one" } });
    expect(await owner.recordingContextProvider(recordingInput("other-user"))).toMatchObject({ ok: false, code: "recording.project_required", metadata: { activeProjectId: null } });
  });
});
